/**
 * POST /api/collections/:id/fragments — Add fragment to collection
 * Body: { fragmentId: string }
 *
 * Constraints (Tim 결정 5-C):
 *   - Fragment must be a root fragment (parent_fragment_id IS NULL).
 *     Continuation children automatically follow their parent.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: collectionId } = await params;
  if (!collectionId) return Response.json({ error: 'Collection ID required' }, { status: 400 });

  const db = createDb();
  try {
    const body = await request.json().catch(() => ({}));
    const { fragmentId } = body;

    if (!fragmentId) {
      return Response.json({ error: 'fragmentId required' }, { status: 400 });
    }

    // Verify collection ownership
    const colRes = await db.query(
      `SELECT id FROM user_collections WHERE id = $1 AND user_id = $2`,
      [collectionId, user.id]
    );
    if (colRes.rows.length === 0) {
      return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Verify fragment ownership + root-only
    const fragRes = await db.query(
      `SELECT id, parent_fragment_id
       FROM story_fragments
       WHERE id = $1 AND user_id = $2`,
      [fragmentId, user.id]
    );
    if (fragRes.rows.length === 0) {
      return Response.json({ error: 'Fragment not found' }, { status: 404 });
    }
    if (fragRes.rows[0].parent_fragment_id !== null) {
      return Response.json({
        error: 'Cannot add a continuation fragment directly. Add the parent instead.',
        reason: 'continuation_child_blocked',
      }, { status: 400 });
    }

    // Compute next user_order
    const orderRes = await db.query(
      `SELECT COALESCE(MAX(user_order), 0) + 1 AS next_order
       FROM collection_fragments
       WHERE collection_id = $1`,
      [collectionId]
    );
    const userOrder = orderRes.rows[0]?.next_order || 1;

    try {
      const insertRes = await db.query(
        `INSERT INTO collection_fragments
           (collection_id, fragment_id, user_order)
         VALUES ($1, $2, $3)
         RETURNING id, added_at, user_order`,
        [collectionId, fragmentId, userOrder]
      );
      return Response.json({ added: insertRes.rows[0] });
    } catch (insertErr) {
      // 23505 = unique_violation (already in collection)
      if (insertErr?.code === '23505' || /duplicate key/i.test(insertErr?.message || '')) {
        return Response.json({
          error: 'Already in this collection',
          alreadyExists: true,
        }, { status: 409 });
      }
      throw insertErr;
    }
  } catch (e) {
    console.error('[POST /api/collections/:id/fragments]', e.message);
    return Response.json({ error: 'Failed to add fragment' }, { status: 500 });
  }
}
