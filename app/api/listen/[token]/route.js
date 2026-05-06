/**
 * GET /api/listen/[token]
 *
 * Public endpoint — no auth. Returns audio + fragment + sender info
 * for a given public_token. Used by /listen/[token] page when family
 * members scan a QR code or follow a shared link.
 *
 * Security:
 *   - Filters by is_public = TRUE (private audio is invisible)
 *   - Token length sanity check (reject obvious garbage)
 *   - Sender info limited to display name (no email, no user_id)
 *   - Token itself is the bearer token; 16-char base64url is
 *     unguessable in practice (62^16 ≈ 4.7e28).
 *
 * Question prompt resolution:
 *   - Questions are stored inside user_books.structure JSONB
 *     (chapters[].questions[]), not in a separate book_questions
 *     table. We LEFT JOIN user_books and walk the JSONB to find
 *     the matching question by id.
 *   - If fragment is free-form (no book_id), question_prompt is null.
 *   - Pattern matches app/api/book/[id]/question/[qId]/route.js.
 *
 * Voice QR System Phase 1 (Step 05). See:
 *   experiments/100-voice-qr-system-phase-1.md
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
 * Handles three cases:
 *   - object { ko, en, es } — pick by lang with fallbacks
 *   - string — return as-is
 *   - null/undefined — return null
 */
function resolvePromptText(promptValue, lang) {
  if (!promptValue) return null;
  if (typeof promptValue === 'string') return promptValue;
  if (typeof promptValue === 'object') {
    return promptValue[lang] || promptValue.ko || promptValue.en || promptValue.es || null;
  }
  return null;
}

export async function GET(request, { params }) {
  const { token } = await params;

  if (!token || token.length < MIN_TOKEN_LEN || token.length > MAX_TOKEN_LEN) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  const db = createDb();

  try {
    // LEFT JOIN user_books on f.book_id so free-form fragments still
    // resolve (book.structure will simply be null).
    const result = await db.query(
      `SELECT
         a.id           AS audio_id,
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
      WHERE a.public_token = $1
        AND a.is_public    = TRUE`,
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'not found or not public' },
        { status: 404 }
      );
    }

    const row = result.rows[0];

    // Resolve question_prompt from JSONB structure.
    let questionPrompt = null;
    if (row.book_structure && row.book_question_id) {
      const question = findQuestionInStructure(
        row.book_structure,
        row.book_question_id
      );
      if (question) {
        questionPrompt = resolvePromptText(
          question.prompt,
          row.fragment_language || 'ko'
        );
      }
    }

    return NextResponse.json({
      audio: {
        id: row.audio_id,
        url: row.r2_url,
        duration_sec: row.duration_sec,
        play_count: row.play_count,
        created_at: row.audio_created_at,
      },
      fragment: {
        id: row.fragment_id,
        title: row.fragment_title,
        subtitle: row.fragment_subtitle,
        content: row.fragment_content,
        language: row.fragment_language,
        question_prompt: questionPrompt,
      },
      sender: {
        // Only name — never email, never user_id beyond what's needed
        // for routing. The /listen page is anonymous; we don't want
        // QR scans to leak account identifiers.
        name: row.user_name || null,
      },
    });
  } catch (e) {
    console.error('[GET /api/listen/:token]', e.message);
    return NextResponse.json(
      { error: 'failed to load audio' },
      { status: 500 }
    );
  }
}
