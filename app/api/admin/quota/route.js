/**
 * GET /api/admin/quota
 *
 * Admin-only — list every user with their quota state and a few
 * cheap activity counters for the /admin/quota table. Gated by
 * either the existing `role='admin'` flag OR the ADMIN_USER_IDS env
 * (defaults to '2' which is Tim).
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '2')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(Number.isFinite);

function isAdmin(user) {
  return user.role === 'admin' || ADMIN_USER_IDS.includes(user.id);
}

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!isAdmin(user)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = createDb();
  try {
    const result = await db.query(`
      SELECT
        u.id, u.email, u.name, u.role, u.tier,
        u.free_token_limit, u.lifetime_tokens_used,
        u.quota_blocked_at, u."createdAt" as created_at,
        (SELECT COUNT(*)::int FROM chat_sessions   WHERE user_id = u.id) AS session_count,
        (SELECT COUNT(*)::int FROM story_fragments WHERE user_id = u.id) AS fragment_count,
        (SELECT COUNT(*)::int FROM user_books      WHERE user_id = u.id AND status = 'in_progress') AS active_books
      FROM "User" u
      ORDER BY u.lifetime_tokens_used DESC NULLS LAST, u.id ASC
    `);
    return Response.json({
      users: result.rows,
      default_free_limit: parseInt(process.env.FREE_TOKEN_LIMIT || '100000', 10),
    });
  } catch (e) {
    console.error('[GET /api/admin/quota]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
