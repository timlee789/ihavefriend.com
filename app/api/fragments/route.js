/**
 * GET  /api/fragments — List user's story fragments
 * POST /api/fragments — Create a new fragment (from local LLM output)
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status  = searchParams.get('status')?.split(',') || ['draft', 'confirmed'];
  const limit   = Math.min(parseInt(searchParams.get('limit')  || '50'), 100);
  const offset  = parseInt(searchParams.get('offset') || '0');
  const theme   = searchParams.get('theme') || null;

  const db = createDb();

  try {
    const { getFragments } = require('@/lib/fragmentManager');
    const fragments = await getFragments(db, user.id, { status, limit, offset, themeFilter: theme });
    return Response.json({ fragments, total: fragments.length });
  } catch (e) {
    console.error('[GET /api/fragments]', e.message);
    return Response.json({ error: 'Failed to fetch fragments' }, { status: 500 });
  }
}

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body = {};
  try { body = await request.json(); } catch {}

  const { title, content } = body;
  if (!title || !content) {
    return Response.json({ error: 'title and content are required' }, { status: 400 });
  }

  const db = createDb();

  try {
    const { createFragment } = require('@/lib/fragmentManager');
    const fragment = await createFragment(db, user.id, body);
    return Response.json({ fragment }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/fragments]', e.message);
    return Response.json({ error: 'Failed to create fragment' }, { status: 500 });
  }
}
