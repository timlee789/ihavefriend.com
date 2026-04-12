/**
 * GET /api/fragments/clusters — Get story grouping suggestions
 *
 * Returns clusters of related fragments that could form a Story.
 * Example: "8 fragments about The Collegiate Grill — make a story?"
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const minSize = parseInt(searchParams.get('min') || '3');

  const db = createDb();

  try {
    const { findFragmentClusters } = require('@/lib/fragmentManager');
    const clusters = await findFragmentClusters(db, user.id, minSize);
    return Response.json({ clusters });
  } catch (e) {
    console.error('[GET /api/fragments/clusters]', e.message);
    return Response.json({ error: 'Failed to find clusters' }, { status: 500 });
  }
}
