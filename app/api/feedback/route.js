/**
 * POST /api/feedback  — save star rating + optional comment
 * GET  /api/feedback  — return stats (admin only)
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { sessionId, rating, comment = '' } = await request.json().catch(() => ({}));

  if (!rating || rating < 1 || rating > 5) {
    return Response.json({ error: 'rating must be 1–5' }, { status: 400 });
  }

  const db = createDb();
  await db.query(
    `INSERT INTO session_feedback (user_id, session_id, rating, comment)
     VALUES ($1, $2, $3, $4)`,
    [user.id, sessionId || null, rating, comment.trim().slice(0, 500)]
  );

  return Response.json({ ok: true });
}

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (user.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createDb();

  const stats = await db.query(`
    SELECT
      COUNT(*)::int                              AS total,
      ROUND(AVG(rating)::numeric, 2)::float     AS avg_rating,
      COUNT(*) FILTER (WHERE rating = 5)::int   AS five_star,
      COUNT(*) FILTER (WHERE rating = 4)::int   AS four_star,
      COUNT(*) FILTER (WHERE rating = 3)::int   AS three_star,
      COUNT(*) FILTER (WHERE rating = 2)::int   AS two_star,
      COUNT(*) FILTER (WHERE rating = 1)::int   AS one_star
    FROM session_feedback
  `);

  const recent = await db.query(`
    SELECT
      f.id, f.rating, f.comment,
      to_char(f.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
      u.name, u.email
    FROM session_feedback f
    JOIN "User" u ON u.id = f.user_id
    ORDER BY f.created_at DESC
    LIMIT 100
  `);

  return Response.json({
    stats: stats.rows[0],
    feedback: recent.rows,
  });
}
