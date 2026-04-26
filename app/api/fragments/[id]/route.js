/**
 * GET    /api/fragments/:id — Fetch a fragment + its continuations (thread)
 * PATCH  /api/fragments/:id — Update a fragment (user edit)
 * DELETE /api/fragments/:id — Soft-delete a fragment
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = await params;
  if (!id) return Response.json({ error: 'Fragment ID required' }, { status: 400 });

  const db = createDb();

  try {
    const fragRes = await db.query(
      `SELECT * FROM story_fragments WHERE id = $1 AND user_id = $2`,
      [id, user.id]
    );
    const fragment = fragRes.rows[0];
    if (!fragment) return Response.json({ error: 'Fragment not found' }, { status: 404 });

    // 🆕 2026-04-25: Load continuations (children) ordered by thread_order
    const contRes = await db.query(
      `SELECT id, title, subtitle, content, thread_order, word_count, created_at
         FROM story_fragments
        WHERE parent_fragment_id = $1 AND user_id = $2
        ORDER BY thread_order ASC NULLS LAST, created_at ASC`,
      [id, user.id]
    );
    fragment.continuations = contRes.rows;

    // 🆕 2026-04-26: Collections this fragment belongs to (Task 36)
    const colRes = await db.query(
      `SELECT c.id, c.name
         FROM user_collections c
         INNER JOIN collection_fragments cf ON cf.collection_id = c.id
        WHERE cf.fragment_id = $1 AND c.user_id = $2
        ORDER BY c.name`,
      [id, user.id]
    );
    fragment.collections = colRes.rows;

    return Response.json({ fragment });
  } catch (e) {
    console.error('[GET /api/fragments/:id]', e.message);
    return Response.json({ error: 'Failed to fetch fragment' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = await params;
  let updates = {};
  try { updates = await request.json(); } catch {}

  if (!id) return Response.json({ error: 'Fragment ID required' }, { status: 400 });

  const db = createDb();

  try {
    const { updateFragment } = require('@/lib/fragmentManager');
    const fragment = await updateFragment(db, user.id, id, updates);
    if (!fragment) return Response.json({ error: 'Fragment not found' }, { status: 404 });
    return Response.json({ fragment });
  } catch (e) {
    console.error('[PATCH /api/fragments/:id]', e.message);
    return Response.json({ error: 'Failed to update fragment' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = await params;
  if (!id) return Response.json({ error: 'Fragment ID required' }, { status: 400 });

  const db = createDb();

  try {
    const { deleteFragment } = require('@/lib/fragmentManager');
    await deleteFragment(db, user.id, id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/fragments/:id]', e.message);
    return Response.json({ error: 'Failed to delete fragment' }, { status: 500 });
  }
}
