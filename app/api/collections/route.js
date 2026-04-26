/**
 * GET  /api/collections — List all user collections (with stats)
 * POST /api/collections — Create a new collection
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  try {
    const result = await db.query(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.display_order,
         c.created_at,
         c.updated_at,
         COUNT(cf.id)::int AS fragment_count,
         COALESCE(SUM(f.word_count), 0)::int AS total_word_count
       FROM user_collections c
       LEFT JOIN collection_fragments cf ON cf.collection_id = c.id
       LEFT JOIN story_fragments f ON f.id = cf.fragment_id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.display_order ASC, c.created_at DESC`,
      [user.id]
    );

    return Response.json({ collections: result.rows });
  } catch (e) {
    console.error('[GET /api/collections]', e.message);
    return Response.json({ error: 'Failed to load collections' }, { status: 500 });
  }
}

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  try {
    const body = await request.json().catch(() => ({}));
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }
    if (name.length > 200) {
      return Response.json({ error: 'Name too long (max 200)' }, { status: 400 });
    }
    if (description && typeof description === 'string' && description.length > 5000) {
      return Response.json({ error: 'Description too long (max 5000)' }, { status: 400 });
    }

    const orderRes = await db.query(
      `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order
       FROM user_collections
       WHERE user_id = $1`,
      [user.id]
    );
    const displayOrder = orderRes.rows[0]?.next_order || 1;

    const result = await db.query(
      `INSERT INTO user_collections
         (user_id, name, description, name_generated_by, display_order)
       VALUES ($1, $2, $3, 'user', $4)
       RETURNING id, name, description, display_order, created_at, updated_at`,
      [user.id, name.trim(), description?.trim() || null, displayOrder]
    );

    const collection = result.rows[0];
    collection.fragment_count = 0;
    collection.total_word_count = 0;

    return Response.json({ collection });
  } catch (e) {
    console.error('[POST /api/collections]', e.message);
    return Response.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}
