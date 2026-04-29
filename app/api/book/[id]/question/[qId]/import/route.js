/**
 * POST   /api/book/[id]/question/[qId]/import
 *        body { fragmentId }
 *
 *        Imports a free-form fragment (book_id IS NULL) as an answer
 *        to this book question. The fragment is NOT moved into the
 *        book — it stays free-form (so it still appears in
 *        /my-stories) and the same fragment can be imported into
 *        multiple books later. We only add it to
 *        user_book_responses.imported_fragment_ids.
 *
 *        409 if the fragment already belongs to another book.
 *
 * DELETE /api/book/[id]/question/[qId]/import?fragmentId=xxx
 *
 *        Removes a previous import. If the response had no other
 *        answers afterwards, status flips back to 'empty'.
 *        Re-counts user_books.completed_questions in either case.
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
  if (!fragmentId) {
    return Response.json({ error: 'fragmentId required' }, { status: 400 });
  }

  const db = createDb();
  try {
    // 1. Fragment must exist, belong to user, and currently be free-form.
    const fragRes = await db.query(
      `SELECT id, book_id FROM story_fragments
        WHERE id = $1 AND user_id = $2`,
      [fragmentId, user.id]
    );
    if (fragRes.rows.length === 0) {
      return Response.json({ error: 'fragment not found' }, { status: 404 });
    }
    if (fragRes.rows[0].book_id) {
      return Response.json({
        error: 'fragment already in a book',
        message: '이 이야기는 이미 다른 책에 속해 있어요',
      }, { status: 409 });
    }

    // 2. Book must belong to user.
    const bookRes = await db.query(
      `SELECT id FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'book not found' }, { status: 404 });
    }

    // 3. Append to imported_fragment_ids; flip 'empty' → 'complete'.
    //    A guard against duplicate import:
    //      WHERE NOT (imported_fragment_ids @> ARRAY[$1]::uuid[])
    const updateRes = await db.query(
      `UPDATE user_book_responses
          SET imported_fragment_ids = array_append(imported_fragment_ids, $1::uuid),
              status                = CASE WHEN status = 'empty' THEN 'complete' ELSE status END,
              selected_imported_id  = COALESCE(selected_imported_id, $1::uuid),
              first_answered_at     = COALESCE(first_answered_at, NOW()),
              last_updated_at       = NOW()
        WHERE book_id = $2 AND question_id = $3
          AND NOT (COALESCE(imported_fragment_ids, '{}'::uuid[]) @> ARRAY[$1]::uuid[])
        RETURNING id`,
      [fragmentId, bookId, qId]
    );

    if (updateRes.rows.length === 0) {
      // Either response row missing or fragment already imported. Fall
      // through to a probe so we can return the right shape.
      const probe = await db.query(
        `SELECT id, imported_fragment_ids FROM user_book_responses
          WHERE book_id = $1 AND question_id = $2`,
        [bookId, qId]
      );
      if (probe.rows.length === 0) {
        return Response.json({ error: 'response not found' }, { status: 404 });
      }
      return Response.json({ ok: true, alreadyImported: true });
    }

    // 4. Recount completed_questions.
    await db.query(
      `UPDATE user_books
          SET completed_questions = (
                SELECT COUNT(*) FROM user_book_responses
                 WHERE book_id = $1 AND status = 'complete'
              ),
              last_active_at = NOW()
        WHERE id = $1`,
      [bookId]
    );

    return Response.json({ ok: true });
  } catch (e) {
    console.error('[POST /api/book/[id]/question/[qId]/import]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, qId } = await params;
  const url = new URL(request.url);
  const fragmentId = url.searchParams.get('fragmentId');
  if (!fragmentId) {
    return Response.json({ error: 'fragmentId required' }, { status: 400 });
  }

  const db = createDb();
  try {
    const bookCheck = await db.query(
      `SELECT id FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookCheck.rows.length === 0) {
      return Response.json({ error: 'book not found' }, { status: 404 });
    }

    // Strip from imported_fragment_ids; if neither imported nor direct
    // arrays still hold anything, status flips back to 'empty' so the
    // suggested-next picker on the overview can route the user back
    // here. selected_imported_id resets when its target was removed.
    await db.query(
      `UPDATE user_book_responses
          SET imported_fragment_ids = array_remove(imported_fragment_ids, $1::uuid),
              selected_imported_id  = CASE
                                        WHEN selected_imported_id = $1::uuid THEN NULL
                                        ELSE selected_imported_id
                                      END,
              status = CASE
                WHEN COALESCE(array_length(array_remove(imported_fragment_ids, $1::uuid), 1), 0) = 0
                 AND COALESCE(array_length(fragment_ids, 1), 0) = 0
                  THEN 'empty'
                ELSE status
              END,
              last_updated_at = NOW()
        WHERE book_id = $2 AND question_id = $3`,
      [fragmentId, bookId, qId]
    );

    await db.query(
      `UPDATE user_books
          SET completed_questions = (
                SELECT COUNT(*) FROM user_book_responses
                 WHERE book_id = $1 AND status = 'complete'
              ),
              last_active_at = NOW()
        WHERE id = $1`,
      [bookId]
    );

    return Response.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/book/[id]/question/[qId]/import]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
