/**
 * POST /api/fragments/[id]/photos/upload-url   (Task 75)
 *
 * Issues a signed Vercel Blob upload URL for a single photo on a
 * specific fragment slot (display_order 1 or 2). Browser uploads
 * straight to Blob; the onUploadCompleted callback then writes the
 * fragment_photos row.
 *
 * Validation surface:
 *   • requireAuth() — 401 if no token.
 *   • Fragment ownership — 403 if the fragment isn't this user's.
 *   • Content type allow-list (image/* only) — videos rejected.
 *   • Size cap 8MB raw (browser already compresses to ~500KB).
 *   • Re-upload to same slot replaces the existing row + Blob.
 */
import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  const { id: fragmentId } = await params;

  // Ownership.
  const frag = await db.query(
    `SELECT id, user_id FROM story_fragments WHERE id = $1`,
    [fragmentId]
  );
  if (frag.rows.length === 0 || frag.rows[0].user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const displayOrder = body?.displayOrder === 2 ? 2 : 1;

  // Re-upload semantics: if a photo already lives in this slot, evict
  // it (Blob + DB) before issuing the new token. The unique index on
  // (fragment_id, display_order) would otherwise reject the insert.
  const existing = await db.query(
    `SELECT id, blob_pathname FROM fragment_photos
      WHERE fragment_id = $1 AND display_order = $2`,
    [fragmentId, displayOrder]
  );
  if (existing.rows.length > 0) {
    const oldRow = existing.rows[0];
    try {
      const { del } = await import('@vercel/blob');
      await del(oldRow.blob_pathname);
    } catch (e) {
      console.warn(`[photos/upload-url] failed to delete old blob: ${e?.message}`);
    }
    await db.query(`DELETE FROM fragment_photos WHERE id = $1`, [oldRow.id]);
  }

  return handleUpload({
    body: body?.handleUploadBody,
    request,
    onBeforeGenerateToken: async (_pathname, clientPayload) => {
      let payload = {};
      try { payload = JSON.parse(clientPayload || '{}'); } catch {}
      if (payload.contentType && !ALLOWED_MIME.includes(payload.contentType)) {
        throw new Error('Only image files are allowed (jpg, png, webp, heic).');
      }
      if (payload.sizeBytes && payload.sizeBytes > MAX_SIZE_BYTES) {
        throw new Error(`File too large (max ${MAX_SIZE_BYTES / 1024 / 1024}MB).`);
      }
      return {
        allowedContentTypes: ALLOWED_MIME,
        maximumSizeInBytes : MAX_SIZE_BYTES,
        addRandomSuffix    : true,
        tokenPayload       : JSON.stringify({
          userId      : user.id,
          fragmentId,
          displayOrder,
        }),
      };
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      let payload = {};
      try { payload = JSON.parse(tokenPayload); } catch {}
      try {
        await db.query(
          `INSERT INTO fragment_photos
             (fragment_id, user_id, blob_url, blob_pathname, mime_type, size_bytes, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            payload.fragmentId,
            payload.userId,
            blob.url,
            blob.pathname,
            blob.contentType,
            blob.size || null,
            payload.displayOrder || 1,
          ]
        );
        console.log(
          `[photos] uploaded fragment=${payload.fragmentId} order=${payload.displayOrder} size=${blob.size}`
        );
      } catch (e) {
        console.error('[photos/upload-url] DB insert failed:', e?.message);
      }
    },
  })
    .then((result) => NextResponse.json(result))
    .catch((e) => {
      console.error('[photos/upload-url] handleUpload error:', e?.message);
      return NextResponse.json({ error: e?.message || 'upload failed' }, { status: 400 });
    });
}
