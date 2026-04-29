/**
 * GET /api/book/[id]/chapter/[chId]
 *
 * Returns a chapter's questions plus a short fragment preview for any
 * questions that have been answered. Senior eyes need to recognise
 * "I already answered this" at a glance.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

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
