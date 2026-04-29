/**
 * POST /api/book/[id]/skip-question
 *
 * Body: { questionId }
 *
 * Marks a response row as 'skipped'. The row already exists from
 * /api/book/start (one row per question), so this is a pure UPDATE.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId } = await params;
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const { questionId } = body || {};
  if (!questionId) {
    return Response.json({ error: 'questionId required' }, { status: 400 });
  }

  const db = createDb();
  try {
    // Confirm the user owns this book before mutating responses.
    const own = await db.query(
      `SELECT 1 FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (own.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    await db.query(
      `UPDATE user_book_responses
          SET status = 'skipped', last_updated_at = NOW()
        WHERE book_id = $1 AND question_id = $2`,
      [bookId, questionId]
    );

    return Response.json({ ok: true });
  } catch (e) {
    console.error('[POST /api/book/[id]/skip-question]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
