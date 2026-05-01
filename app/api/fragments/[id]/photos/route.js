/**
 * GET  /api/fragments/[id]/photos      list owner-gated
 * POST /api/fragments/[id]/photos      direct server-side upload (Task 77)
 *
 * 🔥 Task 77 — server-side upload replaces the client-side
 *   @vercel/blob/client signed-URL flow. The signed-URL flow relies
 *   on `onUploadCompleted` firing as a webhook from Vercel's edge to
 *   our route, which proved flaky in production: the row never
 *   landed, so the slot stayed empty no matter how long we polled.
 *   The body now PUTs the (already-compressed) image straight at
 *   `/api/fragments/[id]/photos` as multipart/form-data; we call
 *   `put()` directly, write the DB row inside the same request, and
 *   return the row to the client. If the DB write fails the blob is
 *   rolled back via `del()` so we never strand orphan blobs.
 */
import { NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  const { id: fragmentId } = await params;

  const frag = await db.query(
    `SELECT user_id FROM story_fragments WHERE id = $1`,
    [fragmentId]
  );
  if (frag.rows.length === 0 || frag.rows[0].user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const photos = await db.query(
    `SELECT id, blob_url, width, height, size_bytes, mime_type,
            caption, display_order, uploaded_at
       FROM fragment_photos
      WHERE fragment_id = $1
      ORDER BY display_order`,
    [fragmentId]
  );
  return NextResponse.json({ photos: photos.rows });
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  const { id: fragmentId } = await params;

  // Ownership.
  const frag = await db.query(
    `SELECT user_id FROM story_fragments WHERE id = $1`,
    [fragmentId]
  );
  if (frag.rows.length === 0 || frag.rows[0].user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let form;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'invalid form data' }, { status: 400 }); }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  const displayOrder = Number(form.get('displayOrder')) === 2 ? 2 : 1;

  // Type + size guards.
  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) {
    return NextResponse.json(
      { error: 'Only image files are allowed (jpg, png, webp, heic).' },
      { status: 400 }
    );
  }
  if (typeof file.size === 'number' && file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE_BYTES / 1024 / 1024}MB).` },
      { status: 400 }
    );
  }

  // Re-upload semantics: evict the existing row + blob in this slot
  // first so the unique (fragment_id, display_order) index doesn't
  // reject the insert.
  const existing = await db.query(
    `SELECT id, blob_pathname FROM fragment_photos
      WHERE fragment_id = $1 AND display_order = $2`,
    [fragmentId, displayOrder]
  );
  if (existing.rows.length > 0) {
    const oldRow = existing.rows[0];
    try { await del(oldRow.blob_pathname); }
    catch (e) { console.warn(`[photos POST] del old blob failed: ${e?.message}`); }
    await db.query(`DELETE FROM fragment_photos WHERE id = $1`, [oldRow.id]);
  }

  // Upload to Vercel Blob.
  let blob;
  const safeName = (file.name || `photo-${displayOrder}.jpg`).replace(/[^\w.-]+/g, '_');
  try {
    blob = await put(`fragment-photos/${user.id}/${fragmentId}/${Date.now()}-${safeName}`, file, {
      access: 'public',
      contentType: mime,
      addRandomSuffix: true,
    });
  } catch (e) {
    console.error('[photos POST] blob put failed:', e?.message);
    return NextResponse.json({ error: 'blob upload failed' }, { status: 500 });
  }

  // Insert the row. On failure, roll back the blob.
  try {
    const insert = await db.query(
      `INSERT INTO fragment_photos
         (fragment_id, user_id, blob_url, blob_pathname, mime_type, size_bytes, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, blob_url, width, height, size_bytes, mime_type,
                 caption, display_order, uploaded_at`,
      [
        fragmentId,
        user.id,
        blob.url,
        blob.pathname,
        mime,
        typeof file.size === 'number' ? file.size : null,
        displayOrder,
      ]
    );
    const photo = insert.rows[0];
    console.log(`[photos] uploaded fragment=${fragmentId} order=${displayOrder} size=${file.size}`);
    return NextResponse.json({ photo });
  } catch (e) {
    console.error('[photos POST] db insert failed:', e?.message);
    try { await del(blob.pathname); } catch {}
    return NextResponse.json({ error: 'db insert failed' }, { status: 500 });
  }
}
