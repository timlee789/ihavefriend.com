/**
 * GET    /api/book/[id]/chapter/[chId]   — chapter detail (Stage 2)
 * PATCH  /api/book/[id]/chapter/[chId]   — rename / re-describe (Stage 4)
 * DELETE /api/book/[id]/chapter/[chId]   — soft-delete (Stage 4)
 *                                         is_active=false. Optional
 *                                         ?preserve=true keeps fragments
 *                                         as free-form by NULLing
 *                                         book_id / book_question_id.
 *                                         ?force=true is required to
 *                                         delete a chapter that has
 *                                         answered questions.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { countActiveQuestions } from '@/lib/bookStructure';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, chId } = await params;
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

    const chapter = (book.structure?.chapters || []).find(c => c.id === chId);
    if (!chapter) {
      return Response.json({ error: 'chapter not found' }, { status: 404 });
    }

    const questionIds = (chapter.questions || []).map(q => q.id);
    const respRes = questionIds.length
      ? await db.query(
          `SELECT * FROM user_book_responses
            WHERE book_id = $1 AND question_id = ANY($2::text[])`,
          [bookId, questionIds]
        )
      : { rows: [] };

    const allFragmentIds = respRes.rows.flatMap(r =>
      [...(r.fragment_ids || []), ...(r.imported_fragment_ids || [])]
    );

    const fragmentMap = Object.create(null);
    if (allFragmentIds.length > 0) {
      const fragRes = await db.query(
        `SELECT id, content, created_at, title FROM story_fragments
          WHERE id = ANY($1::uuid[])`,
        [allFragmentIds]
      );
      for (const f of fragRes.rows) {
        fragmentMap[f.id] = {
          id: f.id,
          title: f.title,
          preview: (f.content || '').substring(0, 80),
          created_at: f.created_at,
        };
      }
    }

    const responseMap = Object.create(null);
    for (const r of respRes.rows) responseMap[r.question_id] = r;

    const questions = (chapter.questions || [])
      .filter(q => q.is_active !== false)
      .map(q => {
        const resp =
          responseMap[q.id] || {
            status: 'empty',
            fragment_ids: [],
            imported_fragment_ids: [],
          };
        const fragments = (resp.fragment_ids || [])
          .map(id => fragmentMap[id])
          .filter(Boolean);
        const imported = (resp.imported_fragment_ids || [])
          .map(id => fragmentMap[id])
          .filter(Boolean);
        return {
          id: q.id,
          order: q.order,
          prompt: q.prompt,
          hint: q.hint,
          topics_to_cover: q.topics_to_cover,
          estimated_minutes: q.estimated_minutes,
          is_optional: q.is_optional || false,
          is_custom: q.is_custom || false,
          response_status: resp.status,
          fragment_count: fragments.length + imported.length,
          fragments,
          imported_fragments: imported,
          selected_fragment_id: resp.selected_fragment_id,
        };
      });

    return Response.json({
      book: { id: book.id, title: book.title, template_id: book.template_id },
      chapter: {
        id: chapter.id,
        order: chapter.order,
        title: chapter.title,
        description: chapter.description,
        intro_prompt: chapter.intro_prompt,
        is_custom: chapter.is_custom || false,
        questions,
      },
    });
  } catch (e) {
    console.error('[GET /api/book/[id]/chapter/[chId]]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/**
 * PATCH /api/book/[id]/chapter/[chId]
 * Body: { title?: string, description?: string|null }
 *
 * Renames or re-describes a chapter in place. The structure JSON is
 * partially-merged so other fields (intro_prompt, questions, …)
 * stay intact.
 */
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, chId } = await params;
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
    const ch = (structure.chapters || []).find(c => c.id === chId);
    if (!ch) return Response.json({ error: 'chapter not found' }, { status: 404 });

    if (typeof body.title === 'string' && body.title.trim()) {
      const t = body.title.trim();
      ch.title = (ch.title && typeof ch.title === 'object') ? { ...ch.title, ko: t } : { ko: t };
    }
    if ('description' in (body || {})) {
      const d = body.description;
      if (d && typeof d === 'string' && d.trim()) {
        const txt = d.trim();
        ch.description = (ch.description && typeof ch.description === 'object')
          ? { ...ch.description, ko: txt }
          : { ko: txt };
      } else {
        ch.description = null;
      }
    }

    await db.query(
      `UPDATE user_books
          SET structure      = $1::jsonb,
              last_active_at = NOW()
        WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(structure), bookId, user.id]
    );

    return Response.json({ ok: true, chapter: ch });
  } catch (e) {
    console.error('[PATCH /api/book/[id]/chapter/[chId]]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/book/[id]/chapter/[chId]?preserve=true&force=true
 *
 * Soft-deletes a chapter (is_active=false) so a future restore-UI can
 * bring it back. Behaviour:
 *
 *   • If the chapter has answered questions and neither preserve=true
 *     nor force=true is set → 409 has_answers (client must show
 *     confirmation).
 *   • preserve=true → fragment.book_id/book_question_id are NULLed
 *     so each answer becomes a free-form fragment in /my-stories.
 *     user_book_responses rows for those questions are then deleted.
 *   • force=true (no preserve) → user_book_responses rows are deleted
 *     but the underlying story_fragments are kept (still appear in
 *     /my-stories with their book pointer intact, just no longer
 *     attached to a live question).
 *
 * Either way the chapter is flipped to is_active=false and totals
 * are recalculated.
 */
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, chId } = await params;
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
    const ch = (structure.chapters || []).find(c => c.id === chId);
    if (!ch) return Response.json({ error: 'chapter not found' }, { status: 404 });

    const questionIds = (ch.questions || []).map(q => q.id);

    if (questionIds.length > 0) {
      const respRes = await db.query(
        `SELECT id, question_id, fragment_ids, status
           FROM user_book_responses
          WHERE book_id = $1 AND question_id = ANY($2::text[]) AND status != 'empty'`,
        [bookId, questionIds]
      );
      const hasAnswers = respRes.rows.length > 0;

      if (hasAnswers && !preserveAnswers && !force) {
        return Response.json({
          error: 'has_answers',
          message: 'chapter has answered questions; pass preserve=true or force=true',
          answer_count: respRes.rows.length,
        }, { status: 409 });
      }

      if (hasAnswers && preserveAnswers) {
        const allFragmentIds = respRes.rows.flatMap(r => r.fragment_ids || []);
        if (allFragmentIds.length > 0) {
          await db.query(
            `UPDATE story_fragments
                SET book_id = NULL, book_question_id = NULL
              WHERE id = ANY($1::uuid[]) AND user_id = $2`,
            [allFragmentIds, user.id]
          );
        }
      }

      // Drop the response rows for this chapter's questions either way.
      await db.query(
        `DELETE FROM user_book_responses
          WHERE book_id = $1 AND question_id = ANY($2::text[])`,
        [bookId, questionIds]
      );
    }

    // Soft delete — keep the row so future "restore" can flip is_active back.
    ch.is_active = false;

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
    console.error('[DELETE /api/book/[id]/chapter/[chId]]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
