/**
 * PATCH  /api/fragments/:id — Update a fragment (user edit)
 * DELETE /api/fragments/:id — Soft-delete a fragment
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

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
