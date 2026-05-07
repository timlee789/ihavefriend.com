/**
 * PATCH  /api/photobooks/[id]/pages/[pageId]  — update page_title / caption
 * DELETE /api/photobooks/[id]/pages/[pageId]  — delete page (+ photo + audio R2)
 *
 * Photobook v3 Phase 1 (P2).
 *
 * Note: photo and audio attach/detach is handled by separate endpoints
 *   POST   /api/photobooks/[id]/pages/[pageId]/photo
 *   POST   /api/photobooks/[id]/pages/[pageId]/audio
 *   DELETE /api/photobooks/[id]/pages/[pageId]/photo
 *   DELETE /api/photobooks/[id]/pages/[pageId]/audio
 *
 * On page delete, ON DELETE CASCADE handles row removal. We collect R2
 * keys first for best-effort storage cleanup (orphaned objects later
 * recoverable via cleanup script if cleanup fails).
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { deleteAudio, deletePhoto } from '@/lib/r2Client';

// ─────────────────────────────────────────────────────────────────
// Helper — verify ownership; returns page row or null
// ─────────────────────────────────────────────────────────────────
async function loadOwnedPage(db, photobookId, pageId, userId) {
  const result = await db.query(
    `SELECT p.id, p.user_book_id, p.page_number, p.page_title,
            p.caption, p.caption_raw, p.created_at, p.updated_at
       FROM photobook_pages p
       JOIN user_books b ON b.id = p.user_book_id
      WHERE p.id = $1
        AND p.user_book_id = $2
        AND b.user_id = $3
        AND b.book_type = 'photobook'`,
    [pageId, photobookId, userId]
  );
  return result.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────
// PATCH — update page_title / caption / caption_raw
// ─────────────────────────────────────────────────────────────────
// Body: { page_title?, caption?, caption_raw? }
// Empty string is allowed and clears the field; only `undefined` skips.
//
// caption_raw is normally written by the audio upload endpoint (which
// stores the original Whisper transcript), but this PATCH allows the
// user to re-set it manually if needed (e.g. clearing it).
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId, pageId } = await params;

  let body = {};
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const updates = {};
  if (body.page_title !== undefined) {
    const v = String(body.page_title || '').trim().slice(0, 200);
    updates.page_title = v || null;
  }
  if (body.caption !== undefined) {
    const v = String(body.caption || '').trim().slice(0, 5000);
    updates.caption = v || null;
  }
  if (body.caption_raw !== undefined) {
    const v = String(body.caption_raw || '').trim().slice(0, 5000);
    updates.caption_raw = v || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const db = createDb();

  try {
    // Verify ownership.
    const page = await loadOwnedPage(db, photobookId, pageId, user.id);
    if (!page) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Build dynamic UPDATE.
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`${col} = $${i++}`);
      values.push(val);
    }
    values.push(pageId);

    const result = await db.query(
      `UPDATE photobook_pages
          SET ${setClauses.join(', ')}
        WHERE id = $${i++}
        RETURNING id, page_number, page_title, caption, caption_raw,
                  created_at, updated_at`,
      values
    );

    // Bump book last_active_at.
    await db.query(
      `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
      [photobookId]
    );

    return NextResponse.json({ page: result.rows[0] });
  } catch (e) {
    console.error('[PATCH /api/photobooks/:id/pages/:pageId]', e?.message);
    return NextResponse.json({ error: 'failed to update page' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE — page + cascade photo + audio + R2 cleanup
// ─────────────────────────────────────────────────────────────────
// page_number values stay as-is (gaps are fine — UI sorts ASC and
// labels by position, not raw page_number). If the user wants tight
// sequential numbering, they reorder via the reorder endpoint.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId, pageId } = await params;

  const db = createDb();

  try {
    // Verify ownership.
    const page = await loadOwnedPage(db, photobookId, pageId, user.id);
    if (!page) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Collect R2 keys before cascade delete.
    // 🔥 R0 — 사진은 압축본 + 원본 둘 다 (legacy 는 r2_key_original NULL).
    const photoQ = await db.query(
      `SELECT r2_key, r2_key_original FROM photobook_page_photos WHERE page_id = $1`,
      [pageId]
    );
    const audioQ = await db.query(
      `SELECT r2_key FROM photobook_page_audios WHERE page_id = $1`,
      [pageId]
    );

    // Cascade delete.
    await db.query(`DELETE FROM photobook_pages WHERE id = $1`, [pageId]);

    // Best-effort R2 cleanup.
    const photoKeys = photoQ.rows.flatMap(r =>
      [r.r2_key, r.r2_key_original].filter(Boolean)
    );
    for (const key of photoKeys) {
      try { await deletePhoto(key); }
      catch (e) { console.warn(`[DELETE page] R2 photo cleanup failed (${key}):`, e?.message); }
    }
    for (const r of audioQ.rows) {
      try { await deleteAudio(r.r2_key); }
      catch (e) { console.warn(`[DELETE page] R2 audio cleanup failed (${r.r2_key}):`, e?.message); }
    }

    // Bump book last_active_at.
    await db.query(
      `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
      [photobookId]
    );

    console.log(`[DELETE /api/photobooks/${photobookId}/pages/${pageId}] page=${page.page_number} (R2: ${photoKeys.length} photo keys [compressed+original], ${audioQ.rows.length} audios)`);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/photobooks/:id/pages/:pageId]', e?.message);
    return NextResponse.json({ error: 'failed to delete page' }, { status: 500 });
  }
}
