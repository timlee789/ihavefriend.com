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
    // 🔥 Sprint 2j V2 (2026-05-11) — LEFT JOIN user_limits for per-user
    //   override fields (Sprint 2j adds max_fragments / max_photos /
    //   max_books / allow_pdf / allow_audio_qr / allow_sharing /
    //   data_retention_days). Plus tier_defaults table for admin to see
    //   "what's the default" alongside user overrides.
    const [usersRes, tierDefaultsRes] = await Promise.all([
      db.query(`
        SELECT
          u.id, u.email, u.name, u.role, u.tier,
          u.free_token_limit, u.lifetime_tokens_used,
          u.quota_blocked_at, u."createdAt" as created_at,
          ul.daily_minutes        AS daily_minutes,
          ul.monthly_minutes      AS monthly_minutes,
          ul.max_fragments        AS max_fragments,
          ul.max_photos           AS max_photos,
          ul.max_books            AS max_books,
          ul.allow_pdf            AS allow_pdf,
          ul.allow_audio_qr       AS allow_audio_qr,
          ul.allow_sharing        AS allow_sharing,
          ul.data_retention_days  AS data_retention_days,
          (SELECT COUNT(*)::int FROM chat_sessions   WHERE user_id = u.id) AS session_count,
          (SELECT COUNT(*)::int FROM story_fragments WHERE user_id = u.id) AS fragment_count,
          (SELECT COUNT(*)::int FROM user_books      WHERE user_id = u.id AND status = 'in_progress') AS active_books
        FROM "User" u
        LEFT JOIN user_limits ul ON ul.user_id = u.id
        ORDER BY u.lifetime_tokens_used DESC NULLS LAST, u.id ASC
      `),
      db.query(`SELECT * FROM tier_defaults ORDER BY
                 CASE tier WHEN 'free' THEN 1 WHEN 'premium' THEN 2 WHEN 'unlimited' THEN 3 ELSE 9 END`),
    ]);

    return Response.json({
      users: usersRes.rows,
      tier_defaults: tierDefaultsRes.rows,
      default_free_limit: parseInt(process.env.FREE_TOKEN_LIMIT || '100000', 10),
    });
  } catch (e) {
    console.error('[GET /api/admin/quota]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
