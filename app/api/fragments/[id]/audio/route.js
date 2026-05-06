/**
 * GET    /api/fragments/[id]/audio  — fetch audio metadata for owner
 * POST   /api/fragments/[id]/audio  — upload audio (multipart) → R2 + DB
 * PATCH  /api/fragments/[id]/audio  — toggle is_public (sharing on/off)
 * DELETE /api/fragments/[id]/audio  — permanent delete (R2 + DB)
 *
 * Voice QR System Phase 1 (Step 04). See:
 *   experiments/100-voice-qr-system-phase-1.md
 *
 * Auth: requireAuth on all methods. Ownership enforced via JOIN on
 *   story_fragments (a user can only touch audio attached to their
 *   own fragments).
 *
 * On re-upload (POST when audio already exists), the previous R2
 *   object is deleted before the new one is inserted, similar to
 *   the photos endpoint's slot-replacement semantics.
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

// 30MB ceiling. Whisper itself caps at 25MB; this is a server-side
// safety margin. EmmaChat clips never approach this in practice.
const MAX_AUDIO_SIZE = 30 * 1024 * 1024;
const ALLOWED_MIME_PREFIX = 'audio/';

export const maxDuration = 30; // seconds, Vercel function timeout

// ─────────────────────────────────────────────────────────────────
// POST — upload audio
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
      { error: `Audio too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB).` },
      { status: 400 }
    );
  }
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return NextResponse.json({ error: 'invalid duration' }, { status: 400 });
  }

  // Re-upload: delete prior R2 object first.
  const existing = await db.query(
    `SELECT id, r2_key FROM fragment_audios WHERE fragment_id = $1`,
    [fragmentId]
  );
  if (existing.rows.length > 0) {
    try {
      await deleteAudio(existing.rows[0].r2_key);
    } catch (e) {
      // R2 delete failures aren't fatal — we proceed and overwrite the
      // DB row. Worst case: an orphan blob in R2.
      console.warn('[audio POST] del old R2 object failed:', e?.message);
    }
  }

  // Upload new audio to R2.
  let r2Result;
  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    const key = makeAudioKey(user.id, fragmentId);
    r2Result = await uploadAudio(buffer, key, mime);
  } catch (e) {
    console.error('[audio POST] R2 upload failed:', e?.message);
    return NextResponse.json({ error: 'storage upload failed' }, { status: 502 });
  }

  // Insert/update DB row. On insert failure, roll back the R2 object.
  try {
    let result;
    if (existing.rows.length > 0) {
      // Update existing row, keep public_token + analytics.
      result = await db.query(
        `UPDATE fragment_audios
            SET r2_key       = $1,
                r2_url       = $2,
                duration_sec = $3,
                size_bytes   = $4,
                mime_type    = $5,
                whisper_text = $6,
                updated_at   = NOW()
          WHERE fragment_id = $7
        RETURNING *`,
        [
          r2Result.key,
          r2Result.url,
          durationSec,
          audio.size || 0,
          mime,
          whisperText,
          fragmentId,
        ]
      );
    } else {
      // Fresh insert.
      const publicToken = generatePublicToken();
      result = await db.query(
        `INSERT INTO fragment_audios
           (fragment_id, user_id, r2_key, r2_url, duration_sec,
            size_bytes, mime_type, whisper_text, public_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          fragmentId,
          user.id,
          r2Result.key,
          r2Result.url,
          durationSec,
          audio.size || 0,
          mime,
          whisperText,
          publicToken,
        ]
      );
    }
    const row = result.rows[0];
    console.log(
      `[audio POST] fragment=${fragmentId} duration=${durationSec}s ` +
      `size=${audio.size} key=${r2Result.key}`
    );
    return NextResponse.json({ audio: row }, { status: 201 });
  } catch (e) {
    console.error('[audio POST] db write failed:', e?.message);
    try { await deleteAudio(r2Result.key); } catch {}
    return NextResponse.json({ error: 'db write failed' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// GET — fetch audio metadata (owner only)
// ─────────────────────────────────────────────────────────────────
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
      WHERE a.fragment_id = $1 AND f.user_id = $2`,
    [fragmentId, user.id]
  );
  return NextResponse.json({ audio: result.rows[0] || null });
}

// ─────────────────────────────────────────────────────────────────
// PATCH — toggle is_public (sharing on/off)
// ─────────────────────────────────────────────────────────────────
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

  // Ownership enforced via subquery on story_fragments.
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

  return NextResponse.json({ audio: result.rows[0] });
}

// ─────────────────────────────────────────────────────────────────
// DELETE — permanent delete (R2 + DB)
// ─────────────────────────────────────────────────────────────────
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  const { id: fragmentId } = await params;

  if (!fragmentId) {
    return NextResponse.json({ error: 'Fragment ID required' }, { status: 400 });
  }

  // Fetch + ownership check.
  const existing = await db.query(
    `SELECT a.id, a.r2_key
       FROM fragment_audios a
       JOIN story_fragments f ON f.id = a.fragment_id
      WHERE a.fragment_id = $1 AND f.user_id = $2`,
    [fragmentId, user.id]
  );

  if (existing.rows.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { r2_key: r2Key } = existing.rows[0];

  // Delete from R2 first. Failure is logged but doesn't block DB
  // delete — orphan R2 objects are recoverable, but a stuck DB row
  // would block re-upload.
  try {
    await deleteAudio(r2Key);
  } catch (e) {
    console.warn('[audio DELETE] R2 delete failed:', e?.message);
  }

  await db.query(
    `DELETE FROM fragment_audios WHERE fragment_id = $1`,
    [fragmentId]
  );

  console.log(`[audio DELETE] fragment=${fragmentId}`);
  return NextResponse.json({ ok: true });
}
