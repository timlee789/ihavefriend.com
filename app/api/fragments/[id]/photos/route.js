/**
 * GET /api/fragments/[id]/photos   (Task 75)
 *
 * Returns the photo rows for a single fragment, ordered by slot.
 * Ownership-gated.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

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
