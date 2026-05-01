/**
 * DELETE /api/fragments/[id]/photos/[photoId]   (Task 75)
 *
 * Removes a single photo: deletes the Blob first, then the row.
 * If the Blob delete fails we still drop the row — leaving an
 * orphan blob is far cheaper than leaving a phantom in the UI.
 */
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  const { id: fragmentId, photoId } = await params;

  const photo = await db.query(
    `SELECT id, blob_pathname, user_id FROM fragment_photos
      WHERE id = $1 AND fragment_id = $2`,
    [photoId, fragmentId]
  );
  if (photo.rows.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (photo.rows[0].user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    await del(photo.rows[0].blob_pathname);
  } catch (e) {
    console.warn(`[photos/delete] blob delete failed: ${e?.message}`);
  }
  await db.query(`DELETE FROM fragment_photos WHERE id = $1`, [photoId]);

  return NextResponse.json({ ok: true });
}
