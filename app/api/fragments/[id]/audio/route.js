/**
 * GET    /api/fragments/[id]/audio  — fetch ALL audios for a fragment (array)
 * POST   /api/fragments/[id]/audio  — append a new audio (multipart) → R2 + DB
 * PATCH  /api/fragments/[id]/audio  — toggle is_public (sharing on/off) for ALL audios
 * DELETE /api/fragments/[id]/audio  — delete a specific audio_order, or all
 *
 * Voice QR System Phase 1 (Step 12). See:
 *   experiments/100-voice-qr-system-phase-1.md
 *
 * 🔥 2026-05-06 (Tim) — Multi-audio support.
 *
 *   Originally one row per fragment; now N rows per fragment, ordered by
 *   audio_order (1, 2, 3, ...). Each fragment_audios row keeps its own
 *   public_token, but the FIRST row's token is what the QR encodes —
 *   /api/listen/[token] returns all sibling audios in order so the
 *   family page can render N <audio> players in one experience.
 *
 *   Limits enforced server-side (easier to tune than DB constraints):
 *     - 5 min per recording (300s)
 *     - 10 recordings per fragment
 *     - 30 recordings per user per day
 *
 *   Limits return 429 with a structured `code` so the client can show
 *   a friendly message; see LIMIT_CODES below.
 *
 * Auth: requireAuth on all methods. Ownership enforced via JOIN on
 *   story_fragments.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import {
  uploadAudio,
  deleteAudio,
  makeAudioKey,
  generatePublicToken,
} from '@/lib/r2Client';

// ─────────────────────────────────────────────────────────────────
// Limits — see Tim decision 2026-05-06
// ─────────────────────────────────────────────────────────────────
const MAX_AUDIO_SIZE = 30 * 1024 * 1024;   // 30MB byte ceiling
const MAX_DURATION_SEC = 300;              // 5 minutes per recording
const MAX_AUDIOS_PER_FRAGMENT = 10;        // 10 recordings per fragment
const MAX_AUDIOS_PER_DAY = 30;             // 30 recordings per user per day
const ALLOWED_MIME_PREFIX = 'audio/';

const LIMIT_CODES = {
  TOO_LONG:    'AUDIO_TOO_LONG',         // single recording > 5 min
  TOO_MANY:    'TOO_MANY_PER_FRAGMENT',  // > 10 in one fragment
  DAILY_QUOTA: 'DAILY_QUOTA_EXCEEDED',   // > 30 today
  TOO_LARGE:   'AUDIO_TOO_LARGE',        // > 30MB byte size
};

export const maxDuration = 30; // Vercel function timeout (seconds)

// ─────────────────────────────────────────────────────────────────
// POST — upload (append) audio
// ─────────────────────────────────────────────────────────────────
export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  const { id: fragmentId } = await params;

  if (!fragmentId) {
    return NextResponse.json({ error: 'Fragment ID required' }, { status: 400 });
  }

  // Ownership.
  const frag = await db.query(
    `SELECT user_id FROM story_fragments WHERE id = $1`,
    [fragmentId]
  );
  if (frag.rows.length === 0 || frag.rows[0].user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Parse multipart.
  let form;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'invalid form data' }, { status: 400 }); }

  const audio = form.get('audio');
  const durationSec = Number(form.get('duration') || 0);
  const whisperText = form.get('whisperText') || null;

  if (!audio || typeof audio === 'string') {
    return NextResponse.json({ error: 'audio file required' }, { status: 400 });
  }

  // Type + size guards.
  const mime = (audio.type || 'audio/webm').toLowerCase();
  if (!mime.startsWith(ALLOWED_MIME_PREFIX)) {
    return NextResponse.json(
      { error: 'Only audio files are allowed.' },
      { status: 400 }
    );
  }
  if (typeof audio.size === 'number' && audio.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      {
        error: `Audio too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB).`,
        code:  LIMIT_CODES.TOO_LARGE,
      },
      { status: 413 }
    );
  }
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return NextResponse.json({ error: 'invalid duration' }, { status: 400 });
  }

  // ─────── Limit 1: per-recording duration ───────
  if (durationSec > MAX_DURATION_SEC) {
    console.warn(`[audio POST] reject — duration ${durationSec}s > ${MAX_DURATION_SEC}s limit (user=${user.id})`);
    return NextResponse.json(
      {
        error:    `Recording exceeds ${MAX_DURATION_SEC / 60} minute limit.`,
        code:     LIMIT_CODES.TOO_LONG,
        max_sec:  MAX_DURATION_SEC,
        actual:   durationSec,
      },
      { status: 429 }
    );
  }

  // ─────── Limit 2: per-fragment count ───────
  const countRow = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM fragment_audios WHERE fragment_id = $1`,
    [fragmentId]
  );
  const currentCount = countRow.rows[0]?.cnt || 0;
  if (currentCount >= MAX_AUDIOS_PER_FRAGMENT) {
    console.warn(`[audio POST] reject — fragment ${fragmentId} already has ${currentCount} audios (limit ${MAX_AUDIOS_PER_FRAGMENT})`);
    return NextResponse.json(
      {
        error:   `This fragment already has ${MAX_AUDIOS_PER_FRAGMENT} recordings.`,
        code:    LIMIT_CODES.TOO_MANY,
        max:     MAX_AUDIOS_PER_FRAGMENT,
        current: currentCount,
      },
      { status: 429 }
    );
  }

  // ─────── Limit 3: per-user per-day count ───────
  // Counts audios created in the last 24 hours (rolling window — simpler
  // than midnight reset and prevents end-of-day spam).
  const dailyRow = await db.query(
    `SELECT COUNT(*)::int AS cnt
       FROM fragment_audios
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '24 hours'`,
    [user.id]
  );
  const dailyCount = dailyRow.rows[0]?.cnt || 0;
  if (dailyCount >= MAX_AUDIOS_PER_DAY) {
    console.warn(`[audio POST] reject — user ${user.id} already has ${dailyCount} audios in 24h (limit ${MAX_AUDIOS_PER_DAY})`);
    return NextResponse.json(
      {
        error:   `Daily recording limit (${MAX_AUDIOS_PER_DAY}) reached. Try again tomorrow.`,
        code:    LIMIT_CODES.DAILY_QUOTA,
        max:     MAX_AUDIOS_PER_DAY,
        current: dailyCount,
      },
      { status: 429 }
    );
  }

  // ─────── Determine next audio_order ───────
  // First recording → 1, continuation → max(audio_order)+1.
  // Race condition: two simultaneous POSTs could both compute the same
  // next order, but the composite UNIQUE (fragment_id, audio_order)
  // catches that — we'd see a 23505 unique_violation and could retry.
  // Beta path is sequential (user records, hits stop, uploads) so the
  // race is extremely unlikely; we'll handle it with a try/catch.
  const orderRow = await db.query(
    `SELECT COALESCE(MAX(audio_order), 0) + 1 AS next_order
       FROM fragment_audios
      WHERE fragment_id = $1`,
    [fragmentId]
  );
  const nextOrder = orderRow.rows[0]?.next_order || 1;

  // ─────── Upload to R2 ───────
  let r2Result;
  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    const key = makeAudioKey(user.id, fragmentId);
    r2Result = await uploadAudio(buffer, key, mime);
  } catch (e) {
    console.error('[audio POST] R2 upload failed:', e?.message);
    return NextResponse.json({ error: 'storage upload failed' }, { status: 502 });
  }

  // ─────── Insert DB row ───────
  // Each audio gets its own public_token. The QR code only encodes the
  // first audio's token; /api/listen/[token] returns all siblings.
  // Giving every row a token keeps things flexible (e.g. future "share
  // just this one part" feature).
  try {
    const publicToken = generatePublicToken();
    const result = await db.query(
      `INSERT INTO fragment_audios
         (fragment_id, user_id, audio_order, r2_key, r2_url,
          duration_sec, size_bytes, mime_type, whisper_text, public_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        fragmentId,
        user.id,
        nextOrder,
        r2Result.key,
        r2Result.url,
        durationSec,
        audio.size || 0,
        mime,
        whisperText,
        publicToken,
      ]
    );
    const row = result.rows[0];
    console.log(
      `[audio POST] fragment=${fragmentId} order=${nextOrder} duration=${durationSec}s ` +
      `size=${audio.size} key=${r2Result.key} (count now ${currentCount + 1}/${MAX_AUDIOS_PER_FRAGMENT})`
    );
    return NextResponse.json({ audio: row }, { status: 201 });
  } catch (e) {
    console.error('[audio POST] db write failed:', e?.message);
    // Roll back the R2 object on DB failure so we don't leak storage.
    try { await deleteAudio(r2Result.key); } catch {}

    // 23505 = unique_violation — race on (fragment_id, audio_order).
    // Tell client to retry.
    if (e?.code === '23505') {
      return NextResponse.json(
        { error: 'concurrent upload — please retry', code: 'RACE_CONDITION' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'db write failed' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// GET — fetch ALL audios for the fragment (owner only)
// ─────────────────────────────────────────────────────────────────
// Returns { audios: [...] } as an array ordered by audio_order ASC.
//
// Backward compat: callers that previously read `data.audio` (singular)
// now get `null` — they should switch to `data.audios[0]` or the array.
// FragmentModal is updated to use the array (Step 14). The /listen
// page already calls a different endpoint and is unaffected.
export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  const { id: fragmentId } = await params;

  if (!fragmentId) {
    return NextResponse.json({ error: 'Fragment ID required' }, { status: 400 });
  }

  const result = await db.query(
    `SELECT a.*
       FROM fragment_audios a
       JOIN story_fragments f ON f.id = a.fragment_id
      WHERE a.fragment_id = $1 AND f.user_id = $2
      ORDER BY a.audio_order ASC`,
    [fragmentId, user.id]
  );

  return NextResponse.json({ audios: result.rows });
}

// ─────────────────────────────────────────────────────────────────
// PATCH — toggle is_public for ALL audios on the fragment
// ─────────────────────────────────────────────────────────────────
// Family experience is one QR → one /listen page → multiple players.
// Toggling visibility is therefore a fragment-wide operation: turning
// sharing OFF hides the entire QR experience, not just one part.
// All rows update together so the family page never sees a partial mix.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  const { id: fragmentId } = await params;

  if (!fragmentId) {
    return NextResponse.json({ error: 'Fragment ID required' }, { status: 400 });
  }

  let body = {};
  try { body = await request.json(); } catch {}

  if (typeof body.is_public !== 'boolean') {
    return NextResponse.json(
      { error: 'is_public (boolean) required' },
      { status: 400 }
    );
  }

  const result = await db.query(
    `UPDATE fragment_audios
        SET is_public  = $1,
            updated_at = NOW()
      WHERE fragment_id = $2
        AND fragment_id IN (
          SELECT id FROM story_fragments WHERE user_id = $3
        )
    RETURNING *`,
    [body.is_public, fragmentId, user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'not found or forbidden' }, { status: 404 });
  }

  // Return all rows in order so the client can refresh state.
  const sorted = result.rows.sort((a, b) => a.audio_order - b.audio_order);
  return NextResponse.json({ audios: sorted });
}

// ─────────────────────────────────────────────────────────────────
// DELETE — delete a specific audio_order, or all audios of a fragment
// ─────────────────────────────────────────────────────────────────
// Accepts ?order=N query param. If omitted, deletes ALL audios for the
// fragment (preserves the "delete all" power user behavior). Single-
// row delete leaves the remaining order values intact (gaps are fine —
// the UI sorts by audio_order ASC and labels them "1부, 2부..." based
// on position, not on raw audio_order value).
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  const { id: fragmentId } = await params;

  if (!fragmentId) {
    return NextResponse.json({ error: 'Fragment ID required' }, { status: 400 });
  }

  // Optional ?order=N for single-audio delete.
  const url = new URL(request.url);
  const orderParam = url.searchParams.get('order');
  const targetOrder = orderParam ? Number(orderParam) : null;

  if (orderParam !== null && (!Number.isInteger(targetOrder) || targetOrder < 1)) {
    return NextResponse.json({ error: 'invalid order' }, { status: 400 });
  }

  // Fetch matching rows + ownership check.
  const baseQuery = `
    SELECT a.id, a.r2_key, a.audio_order
      FROM fragment_audios a
      JOIN story_fragments f ON f.id = a.fragment_id
     WHERE a.fragment_id = $1 AND f.user_id = $2
  `;
  const params2 = [fragmentId, user.id];
  let rowsToDelete;
  if (targetOrder !== null) {
    const r = await db.query(
      `${baseQuery} AND a.audio_order = $3`,
      [...params2, targetOrder]
    );
    rowsToDelete = r.rows;
  } else {
    const r = await db.query(baseQuery, params2);
    rowsToDelete = r.rows;
  }

  if (rowsToDelete.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Delete from R2 (best-effort) then DB.
  for (const row of rowsToDelete) {
    try {
      await deleteAudio(row.r2_key);
    } catch (e) {
      console.warn(`[audio DELETE] R2 delete failed for ${row.r2_key}:`, e?.message);
    }
  }

  if (targetOrder !== null) {
    await db.query(
      `DELETE FROM fragment_audios WHERE fragment_id = $1 AND audio_order = $2`,
      [fragmentId, targetOrder]
    );
    console.log(`[audio DELETE] fragment=${fragmentId} order=${targetOrder} (1 of ${rowsToDelete.length} rows)`);
  } else {
    await db.query(
      `DELETE FROM fragment_audios WHERE fragment_id = $1`,
      [fragmentId]
    );
    console.log(`[audio DELETE] fragment=${fragmentId} (all ${rowsToDelete.length} rows)`);
  }

  return NextResponse.json({ ok: true, deleted: rowsToDelete.length });
}
