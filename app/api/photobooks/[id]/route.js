/**
 * GET    /api/photobooks/[id]  — full photobook (book + pages + photos + audios)
 * PATCH  /api/photobooks/[id]  — update title/subtitle
 * DELETE /api/photobooks/[id]  — delete book + all pages/photos/audios + R2 cleanup
 *
 * Photobook v3 Phase 1 (P2).
 *
 * GET response shape — single round-trip for the editor:
 *   {
 *     photobook: { id, title, subtitle, started_at, last_active_at },
 *     pages: [
 *       {
 *         id, page_number, page_title, caption, caption_raw,
 *         photo:  { id, r2_url, width, height } | null,
 *         audio:  { id, public_token, duration_sec, is_public, ... } | null,
 *       },
 *       ...
 *     ],
 *   }
 *
 * Schema note: user_books uses `subtitle` and `last_active_at`
 * (carried over from memoir flow). photobook_pages and
 * photobook_page_audios DO have `updated_at` columns.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { deleteAudio, deletePhoto } from '@/lib/r2Client';

// ─────────────────────────────────────────────────────────────────
// Helper — verify ownership and book_type, return book row or null
// ─────────────────────────────────────────────────────────────────
async function loadOwnedPhotobook(db, photobookId, userId) {
  const result = await db.query(
    `SELECT id, user_id, title, subtitle, book_type, started_at, last_active_at
       FROM user_books
      WHERE id = $1
        AND user_id = $2
        AND book_type = 'photobook'`,
    [photobookId, userId]
  );
  return result.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────
// GET — full photobook
// ─────────────────────────────────────────────────────────────────
export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId } = await params;

  if (!photobookId) {
    return NextResponse.json({ error: 'photobook id required' }, { status: 400 });
  }

  const db = createDb();

  try {
    const photobook = await loadOwnedPhotobook(db, photobookId, user.id);
    if (!photobook) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Fetch pages + photos + audios in 3 queries (one per table) and
    // stitch in memory. A single SQL with LEFT JOINs is also possible
    // but harder to read and the page count is small (10-30 typical).
    const pagesQ = await db.query(
      `SELECT id, page_number, page_title, caption, caption_raw,
              created_at, updated_at
         FROM photobook_pages
        WHERE user_book_id = $1
        ORDER BY page_number ASC`,
      [photobookId]
    );
    const pageIds = pagesQ.rows.map(p => p.id);

    let photos = [];
    let audios = [];
    if (pageIds.length > 0) {
      const photosQ = await db.query(
        `SELECT id, page_id, r2_key, r2_url, width, height,
                size_bytes, mime_type, created_at
           FROM photobook_page_photos
          WHERE page_id = ANY($1::uuid[])`,
        [pageIds]
      );
      photos = photosQ.rows;

      const audiosQ = await db.query(
        `SELECT id, page_id, duration_sec, size_bytes, mime_type,
                whisper_text, public_token, is_public, play_count,
                first_played_at, last_played_at, created_at, updated_at
           FROM photobook_page_audios
          WHERE page_id = ANY($1::uuid[])`,
        [pageIds]
      );
      audios = audiosQ.rows;
    }

    // Stitch into pages.
    const photosByPage = new Map(photos.map(p => [p.page_id, p]));
    const audiosByPage = new Map(audios.map(a => [a.page_id, a]));

    const pages = pagesQ.rows.map(p => ({
      ...p,
      photo: photosByPage.get(p.id) || null,
      audio: audiosByPage.get(p.id) || null,
    }));

    return NextResponse.json({ photobook, pages });
  } catch (e) {
    console.error('[GET /api/photobooks/:id]', e?.message);
    return NextResponse.json({ error: 'failed to load photobook' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// PATCH — update title/subtitle
// ─────────────────────────────────────────────────────────────────
// Body: { title?, subtitle?  (legacy alias: description) }
// Only provided fields are updated. last_active_at is bumped manually
// (no trigger on user_books for this column).
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId } = await params;

  let body = {};
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const updates = {};
  if (typeof body.title === 'string') {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ error: 'title too long' }, { status: 400 });
    updates.title = title;
  }
  // Accept either `subtitle` or legacy `description` from the client.
  const subtitleRaw = typeof body.subtitle === 'string'
    ? body.subtitle
    : (typeof body.description === 'string' ? body.description : undefined);
  if (typeof subtitleRaw === 'string') {
    const v = subtitleRaw.trim();
    if (v.length > 2000) return NextResponse.json({ error: 'subtitle too long' }, { status: 400 });
    updates.subtitle = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const db = createDb();

  try {
    // Build dynamic UPDATE.
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`${col} = $${i++}`);
      values.push(val);
    }
    values.push(photobookId, user.id);

    const result = await db.query(
      `UPDATE user_books
          SET ${setClauses.join(', ')}, last_active_at = NOW()
        WHERE id = $${i++}
          AND user_id = $${i++}
          AND book_type = 'photobook'
        RETURNING id, title, subtitle, book_type, started_at, last_active_at`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ photobook: result.rows[0] });
  } catch (e) {
    console.error('[PATCH /api/photobooks/:id]', e?.message);
    return NextResponse.json({ error: 'failed to update' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE — book + cascade pages/photos/audios + R2 cleanup
// ─────────────────────────────────────────────────────────────────
// Cascade order:
//   1. Collect R2 keys (photos + audios) BEFORE the DB delete cascades
//      them away, so we can clean up R2 storage afterward.
//   2. DELETE user_books row → ON DELETE CASCADE wipes pages,
//      photos, audios from DB.
//   3. Best-effort delete R2 objects (failures are logged, not fatal —
//      orphaned R2 objects are recoverable later via a cleanup script).
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId } = await params;

  const db = createDb();

  try {
    const photobook = await loadOwnedPhotobook(db, photobookId, user.id);
    if (!photobook) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Collect R2 keys before cascade delete.
    const photoKeysQ = await db.query(
      `SELECT pp.r2_key
         FROM photobook_page_photos pp
         JOIN photobook_pages p ON p.id = pp.page_id
        WHERE p.user_book_id = $1`,
      [photobookId]
    );
    const audioKeysQ = await db.query(
      `SELECT pa.r2_key
         FROM photobook_page_audios pa
         JOIN photobook_pages p ON p.id = pa.page_id
        WHERE p.user_book_id = $1`,
      [photobookId]
    );

    // Cascade DELETE.
    await db.query(
      `DELETE FROM user_books WHERE id = $1 AND user_id = $2`,
      [photobookId, user.id]
    );

    // Best-effort R2 cleanup.
    const allKeys = [
      ...photoKeysQ.rows.map(r => ({ kind: 'photo', key: r.r2_key })),
      ...audioKeysQ.rows.map(r => ({ kind: 'audio', key: r.r2_key })),
    ];
    for (const item of allKeys) {
      try {
        if (item.kind === 'photo') await deletePhoto(item.key);
        else await deleteAudio(item.key);
      } catch (e) {
        console.warn(`[DELETE /api/photobooks/:id] R2 cleanup ${item.kind} failed (${item.key}):`, e?.message);
      }
    }

    console.log(`[DELETE /api/photobooks/:id] id=${photobookId} user=${user.id} (R2 cleanup: ${allKeys.length} objects)`);
    return NextResponse.json({ ok: true, deleted: { photos: photoKeysQ.rows.length, audios: audioKeysQ.rows.length } });
  } catch (e) {
    console.error('[DELETE /api/photobooks/:id]', e?.message);
    return NextResponse.json({ error: 'failed to delete' }, { status: 500 });
  }
}
