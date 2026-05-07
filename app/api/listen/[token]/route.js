/**
 * GET /api/listen/[token]
 *
 * Public endpoint — no auth. Returns audio + sender info for a given
 * public_token. Used by /listen/[token] page when family members scan
 * a QR code or follow a shared link.
 *
 * Two source types share this endpoint:
 *   - fragment_audios       (자서전 — story_fragments + multi-audio)
 *   - photobook_page_audios (사진앨범집 — photobook_pages, 1 per page)
 *
 * The response carries a `type` field so the client can branch:
 *   { type: 'fragment',       audios:[…], fragment:{…}, sender:{…} }
 *   { type: 'photobook_page', page:{…}, audio:{…}, book:{…}, sender:{…} }
 *
 * Token disambiguation: try fragment_audios first (existing flow,
 * larger volume), then photobook_page_audios. Both filter is_public=TRUE
 * so a sharing-off toggle on either side returns 404 immediately.
 *
 * Security:
 *   - Filters by is_public = TRUE (private audio is invisible)
 *   - Token length sanity check (reject obvious garbage)
 *   - Sender info limited to display name (no email, no user_id)
 *   - Token itself is the bearer — 16-char base64url is unguessable
 *     (62^16 ≈ 4.7e28).
 *
 * Voice QR System Phase 1 (Step 05) + R3a (2026-05-07).
 */
import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db';

// Token format: 16-char base64url. We accept 12-20 to leave room for
// future format adjustments without breaking existing QRs.
const MIN_TOKEN_LEN = 12;
const MAX_TOKEN_LEN = 20;

/**
 * Walk a user_books.structure JSONB to find a question by id.
 * Returns the question object { id, prompt, hint, ... } or null.
 * Same traversal pattern used in app/api/book/[id]/question/[qId]/route.js.
 */
function findQuestionInStructure(structure, questionId) {
  if (!structure || !questionId) return null;
  const chapters = structure.chapters || [];
  for (const ch of chapters) {
    if (ch.is_active === false) continue;
    const questions = ch.questions || [];
    for (const q of questions) {
      if (q.is_active === false) continue;
      if (q.id === questionId) return q;
    }
  }
  return null;
}

/**
 * Pick the localized prompt string from a prompt value.
 */
function resolvePromptText(promptValue, lang) {
  if (!promptValue) return null;
  if (typeof promptValue === 'string') return promptValue;
  if (typeof promptValue === 'object') {
    return promptValue[lang] || promptValue.ko || promptValue.en || promptValue.es || null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Build fragment (자서전) response — unchanged from prior behavior
// except the leading `type: 'fragment'` field. fragment_id is passed
// in by the caller (already resolved from the token row).
// ─────────────────────────────────────────────────────────────────
async function buildFragmentResponse(db, fragmentId) {
  const result = await db.query(
    `SELECT
       a.id           AS audio_id,
       a.audio_order,
       a.public_token,
       a.r2_url,
       a.duration_sec,
       a.play_count,
       a.created_at   AS audio_created_at,
       f.id           AS fragment_id,
       f.title        AS fragment_title,
       f.subtitle     AS fragment_subtitle,
       f.content      AS fragment_content,
       f.language     AS fragment_language,
       f.book_id,
       f.book_question_id,
       u.id           AS user_id,
       u.name         AS user_name,
       b.structure    AS book_structure
     FROM fragment_audios a
     JOIN story_fragments f  ON f.id = a.fragment_id
     JOIN "User" u            ON u.id = a.user_id
     LEFT JOIN user_books b  ON b.id = f.book_id
    WHERE a.fragment_id = $1
      AND a.is_public   = TRUE
    ORDER BY a.audio_order ASC`,
    [fragmentId]
  );

  if (result.rows.length === 0) {
    // Edge case: token row was public but somehow none of the
    // fragment's audios are. Treat as not found.
    return NextResponse.json(
      { error: 'not found or not public' },
      { status: 404 }
    );
  }

  const head = result.rows[0];

  // Resolve question_prompt from JSONB structure.
  let questionPrompt = null;
  if (head.book_structure && head.book_question_id) {
    const question = findQuestionInStructure(
      head.book_structure,
      head.book_question_id
    );
    if (question) {
      questionPrompt = resolvePromptText(
        question.prompt,
        head.fragment_language || 'ko'
      );
    }
  }

  const audios = result.rows.map(r => ({
    id:           r.audio_id,
    audio_order:  r.audio_order,
    url:          `/api/audio/${r.public_token}`,
    duration_sec: r.duration_sec,
    play_count:   r.play_count,
    created_at:   r.audio_created_at,
  }));

  return NextResponse.json({
    type: 'fragment',
    audios,
    total_duration_sec: audios.reduce((sum, a) => sum + (a.duration_sec || 0), 0),
    audio_count:        audios.length,
    fragment: {
      id:              head.fragment_id,
      title:           head.fragment_title,
      subtitle:        head.fragment_subtitle,
      content:         head.fragment_content,
      language:        head.fragment_language,
      question_prompt: questionPrompt,
    },
    sender: {
      // Only name — never email, never user_id beyond what's needed
      // for routing. The /listen page is anonymous; we don't want
      // QR scans to leak account identifiers.
      name: head.user_name || null,
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Build photobook_page (사진앨범집) response — new in R3a.
// ─────────────────────────────────────────────────────────────────
// Photo URL goes through the /api/photobook-photo/[id] proxy (same
// pattern the editor uses) so the family browser doesn't see the
// pub-*.r2.dev URL Chrome SafeBrowsing flags.
//
// Audio URL goes through /api/audio/[token] — that route already
// handles photobook_page_audios since the R0 UNION fix.
async function buildPhotobookPageResponse(db, pageId) {
  const result = await db.query(
    `SELECT
       p.id           AS page_id,
       p.page_number,
       p.page_title,
       p.caption,
       pp.id          AS photo_id,
       pp.r2_url      AS photo_r2_url,
       pp.width       AS photo_width,
       pp.height      AS photo_height,
       pa.id          AS audio_id,
       pa.public_token,
       pa.duration_sec,
       pa.play_count,
       pa.created_at  AS audio_created_at,
       b.id           AS book_id,
       b.title        AS book_title,
       b.subtitle     AS book_subtitle,
       u.name         AS user_name
     FROM photobook_pages p
     JOIN user_books b ON b.id = p.user_book_id
     JOIN "User" u     ON u.id = b.user_id
     LEFT JOIN photobook_page_photos pp ON pp.page_id = p.id
     LEFT JOIN photobook_page_audios pa ON pa.page_id = p.id
    WHERE p.id = $1
      AND b.book_type = 'photobook'
      AND pa.is_public = TRUE
    LIMIT 1`,
    [pageId]
  );

  if (result.rows.length === 0) {
    // The token's page exists but the audio became private between
    // the token lookup and this query, OR the row genuinely has no
    // public audio. Either way, family page sees not-found.
    return NextResponse.json(
      { error: 'not found or not public' },
      { status: 404 }
    );
  }

  const r = result.rows[0];

  return NextResponse.json({
    type: 'photobook_page',
    page: {
      id:          r.page_id,
      page_number: r.page_number,
      page_title:  r.page_title,
      caption:     r.caption,
      photo: r.photo_id ? {
        id:     r.photo_id,
        // Proxy through our domain — same R0 pattern as the editor.
        url:    `/api/photobook-photo/${r.photo_id}`,
        width:  r.photo_width,
        height: r.photo_height,
      } : null,
    },
    audio: r.audio_id ? {
      id:           r.audio_id,
      url:          `/api/audio/${r.public_token}`,
      duration_sec: r.duration_sec,
      play_count:   r.play_count,
      created_at:   r.audio_created_at,
    } : null,
    book: {
      id:       r.book_id,
      title:    r.book_title,
      subtitle: r.book_subtitle,
    },
    sender: {
      name: r.user_name || null,
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// GET handler — token → which table → which builder
// ─────────────────────────────────────────────────────────────────
export async function GET(request, { params }) {
  const { token } = await params;

  if (!token || token.length < MIN_TOKEN_LEN || token.length > MAX_TOKEN_LEN) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  const db = createDb();

  try {
    // Try fragment_audios first — the older / higher-volume table.
    const fragQ = await db.query(
      `SELECT a.fragment_id
         FROM fragment_audios a
        WHERE a.public_token = $1
          AND a.is_public    = TRUE
        LIMIT 1`,
      [token]
    );
    if (fragQ.rows.length > 0) {
      return await buildFragmentResponse(db, fragQ.rows[0].fragment_id);
    }

    // Fallback — photobook_page_audios.
    const pbQ = await db.query(
      `SELECT a.page_id
         FROM photobook_page_audios a
        WHERE a.public_token = $1
          AND a.is_public    = TRUE
        LIMIT 1`,
      [token]
    );
    if (pbQ.rows.length > 0) {
      return await buildPhotobookPageResponse(db, pbQ.rows[0].page_id);
    }

    return NextResponse.json(
      { error: 'not found or not public' },
      { status: 404 }
    );
  } catch (e) {
    console.error('[GET /api/listen/:token]', e.message);
    return NextResponse.json(
      { error: 'failed to load audio' },
      { status: 500 }
    );
  }
}
