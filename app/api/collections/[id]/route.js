/**
 * GET    /api/collections/:id — Collection detail + fragments
 * PATCH  /api/collections/:id — Update name/description
 * DELETE /api/collections/:id — Delete collection (cascade fragments link)
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = await params;
  if (!id) return Response.json({ error: 'Collection ID required' }, { status: 400 });

  const db = createDb();
  try {
    const colRes = await db.query(
      `SELECT id, name, description, display_order, created_at, updated_at
       FROM user_collections
       WHERE id = $1 AND user_id = $2`,
      [id, user.id]
    );
    if (colRes.rows.length === 0) {
      return Response.json({ error: 'Collection not found' }, { status: 404 });
    }
    const collection = colRes.rows[0];

    const fragRes = await db.query(
      `SELECT
         f.id,
         f.title,
         f.subtitle,
         f.word_count,
         f.created_at AS fragment_created_at,
         cf.added_at,
         cf.user_order,
         (SELECT COUNT(*)::int FROM story_fragments c
            WHERE c.parent_fragment_id = f.id) AS continuation_count
       FROM collection_fragments cf
       INNER JOIN story_fragments f ON f.id = cf.fragment_id
       WHERE cf.collection_id = $1
       ORDER BY cf.added_at ASC`,
      [id]
    );

    collection.fragments = fragRes.rows;
    collection.fragment_count = fragRes.rows.length;
    collection.total_word_count = fragRes.rows.reduce(
      (sum, f) => sum + (f.word_count || 0),
      0
    );

    return Response.json({ collection });
  } catch (e) {
    console.error('[GET /api/collections/:id]', e.message);
    return Response.json({ error: 'Failed to load collection' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = await params;
  if (!id) return Response.json({ error: 'Collection ID required' }, { status: 400 });

  const db = createDb();
  try {
    const body = await request.json().catch(() => ({}));
    const { name, description } = body;

    if (name === undefined && description === undefined) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return Response.json({ error: 'Invalid name' }, { status: 400 });
      }
      if (name.length > 200) {
        return Response.json({ error: 'Name too long' }, { status: 400 });
      }
    }
    if (description !== undefined && description !== null && typeof description === 'string' && description.length > 5000) {
      return Response.json({ error: 'Description too long' }, { status: 400 });
    }

    const updates = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name.trim());
      updates.push(`name_generated_by = $${idx++}`);
      values.push('user');
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(description?.trim() || null);
    }
    updates.push(`updated_at = NOW()`);
    values.push(id, user.id);

    const result = await db.query(
      `UPDATE user_collections
       SET ${updates.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx}
       RETURNING id, name, description, display_order, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    return Response.json({ collection: result.rows[0] });
  } catch (e) {
    console.error('[PATCH /api/collections/:id]', e.message);
    return Response.json({ error: 'Failed to update collection' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = await params;
  if (!id) return Response.json({ error: 'Collection ID required' }, { status: 400 });

  const db = createDb();
  try {
    const result = await db.query(
      `DELETE FROM user_collections
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, user.id]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    return Response.json({ deleted: true, id });
  } catch (e) {
    console.error('[DELETE /api/collections/:id]', e.message);
    return Response.json({ error: 'Failed to delete collection' }, { status: 500 });
  }
}
