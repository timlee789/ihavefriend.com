/**
 * GET /api/book/list
 *
 * Books the user has started (any status). Sorted most-recently-active
 * first so the resume affordance lands on top.
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
         b.id, b.template_id, b.title, b.status,
         b.total_questions, b.completed_questions,
         b.current_chapter_id, b.current_question_id, b.last_question_id,
         b.last_active_at, b.started_at,
         t.name AS template_name, t.category AS template_category
       FROM user_books b
       LEFT JOIN book_template_definitions t ON t.id = b.template_id
       WHERE b.user_id = $1
       ORDER BY b.last_active_at DESC NULLS LAST, b.started_at DESC`,
      [user.id]
    );
    return Response.json({ books: result.rows });
  } catch (e) {
    console.error('[GET /api/book/list]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
