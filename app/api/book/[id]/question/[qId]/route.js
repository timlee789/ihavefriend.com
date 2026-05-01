/**
 * GET    /api/book/[id]/question/[qId]   — single-question detail (Stage 2)
 * PATCH  /api/book/[id]/question/[qId]   — update prompt/hint/optional (Stage 4)
 * DELETE /api/book/[id]/question/[qId]   — hard-delete from structure (Stage 4)
 *                                          ?preserve=true keeps fragment as
 *                                          free-form by NULLing book_id /
 *                                          book_question_id. ?force=true
 *                                          required when answers exist.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { countActiveQuestions } from '@/lib/bookStructure';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, qId } = await params;
  const db = createDb();

  try {
    const bookRes = await db.query(
      `SELECT * FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const book = bookRes.rows[0];

    // Build the flat (active-only) chapter + question list to compute
    // prev/next pointers in a single pass.
    const flat = [];
    for (const ch of book.structure?.chapters || []) {
      if (ch.is_active === false) continue;
      for (const q of ch.questions || []) {
        if (q.is_active === false) continue;
        flat.push({ q, ch });
      }
    }

    let question = null;
    let chapter = null;
    let prevQId = null;
    let nextQId = null;
    for (let i = 0; i < flat.length; i++) {
      if (flat[i].q.id === qId) {
        question = flat[i].q;
        chapter = flat[i].ch;
        prevQId = flat[i - 1]?.q.id || null;
        nextQId = flat[i + 1]?.q.id || null;
        break;
      }
    }

    if (!question) {
      return Response.json({ error: 'question not found' }, { status: 404 });
    }

    const respRes = await db.query(
      `SELECT * FROM user_book_responses
        WHERE book_id = $1 AND question_id = $2`,
      [bookId, qId]
    );
    const response =
      respRes.rows[0] || {
        status: 'empty',
        fragment_ids: [],
        imported_fragment_ids: [],
      };

    // 🆕 Stage 5: split direct answers vs imported free-form fragments.
    //   Direct = fragments produced by a /chat?mode=book session
    //            (saved with book_id set on insert).
    //   Imported = free-form fragments the user pulled in via
    //              /api/book/[id]/question/[qId]/import — book_id
    //              stays NULL on those rows so they keep showing in
    //              /my-stories.
    const directIds   = response.fragment_ids || [];
    const importedIds = response.imported_fragment_ids || [];
    const allIds      = [...directIds, ...importedIds];
    let directFragments   = [];
    let importedFragments = [];
    if (allIds.length > 0) {
      // 🔥 Task 79 — pull each fragment's photos alongside the body
      //   so the new FragmentModal on the question page can render
      //   thumbnails / open the uploader without a second round-trip.
      const fragRes = await db.query(
        `SELECT
           f.id, f.title, f.subtitle, f.content, f.created_at,
           COALESCE((
             SELECT json_agg(
                      json_build_object(
                        'id',            p.id,
                        'blob_url',      p.blob_url,
                        'width',         p.width,
                        'height',        p.height,
                        'display_order', p.display_order,
                        'caption',       p.caption
                      ) ORDER BY p.display_order
                    )
              FROM fragment_photos p
             WHERE p.fragment_id = f.id
           ), '[]'::json) AS photos
         FROM story_fragments f
        WHERE f.id = ANY($1::uuid[])
        ORDER BY f.created_at DESC`,
        [allIds]
      );
      const directSet = new Set(directIds.map(x => String(x)));
      for (const f of fragRes.rows) {
        if (directSet.has(String(f.id))) directFragments.push(f);
        else importedFragments.push(f);
      }
    }

    return Response.json({
      book: { id: book.id, title: book.title },
      chapter: {
        id: chapter.id,
        order: chapter.order,
        title: chapter.title,
      },
      question: {
        id: question.id,
        order: question.order,
        prompt: question.prompt,
        hint: question.hint,
        topics_to_cover: question.topics_to_cover,
        estimated_minutes: question.estimated_minutes,
        is_optional: question.is_optional || false,
        is_custom: question.is_custom || false,
      },
      response: {
        status: response.status,
        // direct answers (kept under `fragments` for back-compat with
        //   the Stage 2/3 page that reads response.fragments)
        fragments: directFragments,
        // 🆕 Stage 5
        imported_fragments: importedFragments,
        selected_fragment_id: response.selected_fragment_id,
        selected_imported_id: response.selected_imported_id,
      },
      navigation: {
        previous_question_id: prevQId,
        next_question_id: nextQId,
      },
    });
  } catch (e) {
    console.error('[GET /api/book/[id]/question/[qId]]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/**
 * PATCH /api/book/[id]/question/[qId]
 * Body: { prompt?, hint?, is_optional? }
 *
 * Edits a question's prompt / hint / optional flag in place. Other
 * fields (estimated_minutes, topics_to_cover, …) are preserved.
 */
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, qId } = await params;
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const db = createDb();
  try {
    const bookRes = await db.query(
      `SELECT structure FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const structure = bookRes.rows[0].structure || { chapters: [] };

    let foundQ = null;
    for (const ch of structure.chapters || []) {
      foundQ = (ch.questions || []).find(q => q.id === qId);
      if (foundQ) break;
    }
    if (!foundQ) return Response.json({ error: 'question not found' }, { status: 404 });

    if (typeof body.prompt === 'string' && body.prompt.trim()) {
      const t = body.prompt.trim();
      foundQ.prompt = (foundQ.prompt && typeof foundQ.prompt === 'object')
        ? { ...foundQ.prompt, ko: t }
        : { ko: t };
    }
    if ('hint' in (body || {})) {
      const h = body.hint;
      if (h && typeof h === 'string' && h.trim()) {
        const txt = h.trim();
        foundQ.hint = (foundQ.hint && typeof foundQ.hint === 'object')
          ? { ...foundQ.hint, ko: txt }
          : { ko: txt };
      } else {
        foundQ.hint = null;
      }
    }
    if (typeof body.is_optional === 'boolean') {
      foundQ.is_optional = body.is_optional;
    }

    await db.query(
      `UPDATE user_books
          SET structure      = $1::jsonb,
              last_active_at = NOW()
        WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(structure), bookId, user.id]
    );

    return Response.json({ ok: true, question: foundQ });
  } catch (e) {
    console.error('[PATCH /api/book/[id]/question/[qId]]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/book/[id]/question/[qId]?preserve=true&force=true
 *
 * Hard-deletes a question from the chapter's questions[] array
 * (chapters keep is_active=false soft-delete; questions are removed
 * entirely so the order/list stays clean).
 *
 *   • If the question has answers and neither preserve nor force is
 *     set → 409 has_answers.
 *   • preserve=true → fragment.book_id/book_question_id are NULLed
 *     so the answer becomes a free-form fragment in /my-stories.
 *   • force=true (no preserve) → user_book_responses is dropped but
 *     the underlying story_fragments stay intact.
 */
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, qId } = await params;
  const url = new URL(request.url);
  const preserveAnswers = url.searchParams.get('preserve') === 'true';
  const force           = url.searchParams.get('force')    === 'true';

  const db = createDb();
  try {
    const bookRes = await db.query(
      `SELECT structure FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const structure = bookRes.rows[0].structure || { chapters: [] };

    const respRes = await db.query(
      `SELECT id, fragment_ids, status
         FROM user_book_responses
        WHERE book_id = $1 AND question_id = $2`,
      [bookId, qId]
    );
    const resp = respRes.rows[0];
    const fragIds = resp ? (resp.fragment_ids || []) : [];
    const hasAnswers = !!(resp && resp.status !== 'empty' && fragIds.length > 0);

    if (hasAnswers && !preserveAnswers && !force) {
      return Response.json({
        error: 'has_answers',
        message: 'question has answers; pass preserve=true or force=true',
        fragment_count: fragIds.length,
      }, { status: 409 });
    }

    if (hasAnswers && preserveAnswers && fragIds.length > 0) {
      await db.query(
        `UPDATE story_fragments
            SET book_id = NULL, book_question_id = NULL
          WHERE id = ANY($1::uuid[]) AND user_id = $2`,
        [fragIds, user.id]
      );
    }

    await db.query(
      `DELETE FROM user_book_responses WHERE book_id = $1 AND question_id = $2`,
      [bookId, qId]
    );

    // Hard-remove from the chapter's questions[] (chapters are
    // soft-deleted, questions hard-deleted — keeps the list clean).
    let removed = false;
    for (const ch of structure.chapters || []) {
      const idx = (ch.questions || []).findIndex(q => q.id === qId);
      if (idx >= 0) {
        ch.questions.splice(idx, 1);
        ch.questions.forEach((q, i) => { q.order = i + 1; });
        removed = true;
        break;
      }
    }
    if (!removed) {
      return Response.json({ error: 'question not found' }, { status: 404 });
    }

    const totalQuestions = countActiveQuestions(structure);

    await db.query(
      `UPDATE user_books
          SET structure          = $1::jsonb,
              total_questions    = $2,
              completed_questions = (
                SELECT COUNT(*) FROM user_book_responses
                 WHERE book_id = $3 AND status = 'complete'
              ),
              last_active_at     = NOW()
        WHERE id = $3 AND user_id = $4`,
      [JSON.stringify(structure), totalQuestions, bookId, user.id]
    );

    return Response.json({ ok: true, preserved: preserveAnswers });
  } catch (e) {
    console.error('[DELETE /api/book/[id]/question/[qId]]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
