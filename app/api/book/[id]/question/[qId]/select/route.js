/**
 * POST /api/book/[id]/question/[qId]/select
 * body { fragmentId, type: 'direct' | 'imported' }
 *
 * When the user has multiple answers for a single question (e.g. they
 * tapped "✏️ 다시 답변하기" and recorded again), they need to pick
 * which one ends up in the printed book. This endpoint flips
 *   selected_fragment_id   (type='direct')   OR
 *   selected_imported_id   (type='imported')
 * on user_book_responses, mutually exclusively — picking a direct
 * fragment clears the imported pointer and vice-versa, so the PDF
 * generator picks the right text deterministically.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, qId } = await params;
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const fragmentId = body?.fragmentId;
  const type       = body?.type === 'imported' ? 'imported' : 'direct';
  if (!fragmentId) {
    return Response.json({ error: 'fragmentId required' }, { status: 400 });
  }

  const db = createDb();
  try {
    // Confirm the user owns this book and a response row exists for
    // the question — otherwise pretend it isn't found rather than
    // touching anything. The fragmentId itself is validated against
    // the response row's array column inside the UPDATE so we never
    // select a fragment the user didn't actually save / import here.
    const checkRes = await db.query(
      `SELECT r.id, r.fragment_ids, r.imported_fragment_ids
         FROM user_books b
         JOIN user_book_responses r ON r.book_id = b.id
        WHERE b.id = $1 AND b.user_id = $2 AND r.question_id = $3`,
      [bookId, user.id, qId]
    );
    if (checkRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const row = checkRes.rows[0];

    if (type === 'imported') {
      const ok = (row.imported_fragment_ids || []).map(String).includes(String(fragmentId));
      if (!ok) {
        return Response.json({ error: 'fragment not in response' }, { status: 400 });
      }
      await db.query(
        `UPDATE user_book_responses
            SET selected_imported_id = $1::uuid,
                selected_fragment_id = NULL,
                last_updated_at      = NOW()
          WHERE book_id = $2 AND question_id = $3`,
        [fragmentId, bookId, qId]
      );
    } else {
      const ok = (row.fragment_ids || []).map(String).includes(String(fragmentId));
      if (!ok) {
        return Response.json({ error: 'fragment not in response' }, { status: 400 });
      }
      await db.query(
        `UPDATE user_book_responses
            SET selected_fragment_id = $1::uuid,
                selected_imported_id = NULL,
                last_updated_at      = NOW()
          WHERE book_id = $2 AND question_id = $3`,
        [fragmentId, bookId, qId]
      );
    }

    return Response.json({ ok: true, type, fragmentId });
  } catch (e) {
    console.error('[POST /api/book/[id]/question/[qId]/select]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
