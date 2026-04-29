/**
 * POST /api/book/[id]/chapter
 *
 * Body: { title: string, description?, afterChapterId?, firstQuestion? }
 *
 * Adds a custom chapter (is_custom: true). Inserted after
 * `afterChapterId` if provided, otherwise appended. If a
 * `firstQuestion` string is supplied a single question is created
 * inside the chapter so the user has somewhere to land.
 *
 * Side effects:
 *   • structure JSON re-numbered (chapter.order = i+1)
 *   • new user_book_responses rows for any new questions
 *   • user_books.total_questions refreshed via countActiveQuestions
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { genId, countActiveQuestions } from '@/lib/bookStructure';

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId } = await params;
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const { title, description, afterChapterId, firstQuestion } = body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return Response.json({ error: 'title required' }, { status: 400 });
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

    const structure = bookRes.rows[0].structure || { chapters: [] };
    if (!Array.isArray(structure.chapters)) structure.chapters = [];

    const newChapter = {
      id: genId('ch-custom'),
      order: 0, // recomputed below
      title:        { ko: title.trim() },
      description:  description && description.trim() ? { ko: description.trim() } : null,
      intro_prompt: null,
      is_active:    true,
      is_custom:    true,
      questions:    [],
    };

    if (firstQuestion && typeof firstQuestion === 'string' && firstQuestion.trim()) {
      newChapter.questions.push({
        id:                genId('q-custom'),
        order:             1,
        prompt:            { ko: firstQuestion.trim() },
        hint:              null,
        estimated_minutes: 5,
        is_optional:       false,
        is_active:         true,
        is_custom:         true,
      });
    }

    let insertIndex = structure.chapters.length;
    if (afterChapterId) {
      const idx = structure.chapters.findIndex(c => c.id === afterChapterId);
      if (idx >= 0) insertIndex = idx + 1;
    }
    structure.chapters.splice(insertIndex, 0, newChapter);
    structure.chapters.forEach((c, i) => { c.order = i + 1; });

    // Bulk-insert response rows for any new questions.
    if (newChapter.questions.length > 0) {
      const placeholders = newChapter.questions
        .map((_, i) => `($1, $2, $${i + 3})`).join(', ');
      const args = [bookId, user.id, ...newChapter.questions.map(q => q.id)];
      await db.query(
        `INSERT INTO user_book_responses (book_id, user_id, question_id) VALUES ${placeholders}`,
        args
      );
    }

    const totalQuestions = countActiveQuestions(structure);

    await db.query(
      `UPDATE user_books
          SET structure       = $1::jsonb,
              total_questions = $2,
              last_active_at  = NOW()
        WHERE id = $3 AND user_id = $4`,
      [JSON.stringify(structure), totalQuestions, bookId, user.id]
    );

    return Response.json({ ok: true, chapter: newChapter });
  } catch (e) {
    console.error('[POST /api/book/[id]/chapter]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
