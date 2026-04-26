/**
 * DELETE /api/collections/:id/fragments/:fragmentId
 *   - Remove fragment from collection (does NOT delete the fragment itself)
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: collectionId, fragmentId } = await params;
  if (!collectionId || !fragmentId) {
    return Response.json({ error: 'IDs required' }, { status: 400 });
  }

  const db = createDb();
  try {
    // Verify collection ownership
    const colRes = await db.query(
      `SELECT id FROM user_collections WHERE id = $1 AND user_id = $2`,
      [collectionId, user.id]
    );
    if (colRes.rows.length === 0) {
      return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    const result = await db.query(
      `DELETE FROM collection_fragments
       WHERE collection_id = $1 AND fragment_id = $2
       RETURNING id`,
      [collectionId, fragmentId]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'Fragment not in collection' }, { status: 404 });
    }

    return Response.json({ removed: true });
  } catch (e) {
    console.error('[DELETE /api/collections/:id/fragments/:fragmentId]', e.message);
    return Response.json({ error: 'Failed to remove fragment' }, { status: 500 });
  }
}
