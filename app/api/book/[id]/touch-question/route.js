/**
 * POST /api/book/[id]/touch-question
 *
 * Body: { questionId }
 *
 * Stamps the user's "last visited" question + chapter so that returning
 * to the book lands them where they left off. Fire-and-forget from the
 * client; failures don't matter to the user-visible flow.
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
    const bookRes = await db.query(
      `SELECT structure FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    let chapterId = null;
    for (const ch of bookRes.rows[0].structure?.chapters || []) {
      if ((ch.questions || []).some(q => q.id === questionId)) {
        chapterId = ch.id;
        break;
      }
    }

    await db.query(
      `UPDATE user_books
          SET last_question_id   = $1,
              current_question_id = $1,
              current_chapter_id  = $2,
              last_active_at      = NOW()
        WHERE id = $3 AND user_id = $4`,
      [questionId, chapterId, bookId, user.id]
    );

    return Response.json({ ok: true });
  } catch (e) {
    console.error('[POST /api/book/[id]/touch-question]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
