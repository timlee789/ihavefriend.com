/**
 * POST /api/stories — Create a Story from a cluster of fragments
 *
 * Body: { title, description?, fragmentIds: [uuid, ...], chapterType? }
 * Returns: { story }
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body = {};
  try { body = await request.json(); } catch {}

  const { title, fragmentIds } = body;
  if (!title || !fragmentIds?.length) {
    return Response.json({ error: 'title and fragmentIds are required' }, { status: 400 });
  }

  const db = createDb();

  try {
    const { createStory } = require('@/lib/fragmentManager');
    const story = await createStory(db, user.id, body);
    return Response.json({ story }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/stories]', e.message);
    return Response.json({ error: 'Failed to create story' }, { status: 500 });
  }
}

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();

  try {
    const result = await db.query(
      `SELECT * FROM stories WHERE user_id = $1 AND status != 'deleted' ORDER BY created_at DESC`,
      [user.id]
    );
    return Response.json({ stories: result.rows });
  } catch (e) {
    console.error('[GET /api/stories]', e.message);
    return Response.json({ error: 'Failed to fetch stories' }, { status: 500 });
  }
}
