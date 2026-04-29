/**
 * GET /api/book/[id]/question/[qId]
 *
 * Single-question detail with prev/next navigation across the active
 * chapter+question flat list.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

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

    const allIds = [
      ...(response.fragment_ids || []),
      ...(response.imported_fragment_ids || []),
    ];
    let fragments = [];
    if (allIds.length > 0) {
      const fragRes = await db.query(
        `SELECT id, title, content, created_at FROM story_fragments
          WHERE id = ANY($1::uuid[]) ORDER BY created_at DESC`,
        [allIds]
      );
      fragments = fragRes.rows;
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
        fragments,
        selected_fragment_id: response.selected_fragment_id,
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
