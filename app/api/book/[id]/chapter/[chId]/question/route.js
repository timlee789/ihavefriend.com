/**
 * POST /api/book/[id]/chapter/[chId]/question
 *
 * Body: { prompt: string, hint?: string, afterQuestionId? }
 *
 * Adds a custom question (is_custom: true) to a chapter. Inserted
 * after `afterQuestionId` if provided, otherwise appended to the end
 * of the chapter. Creates the matching user_book_responses row so
 * progress queries work without a backfill step.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { genId, countActiveQuestions } from '@/lib/bookStructure';

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, chId } = await params;
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const { prompt, hint, afterQuestionId } = body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return Response.json({ error: 'prompt required' }, { status: 400 });
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
    const ch = (structure.chapters || []).find(c => c.id === chId);
    if (!ch) return Response.json({ error: 'chapter not found' }, { status: 404 });
    if (!Array.isArray(ch.questions)) ch.questions = [];

    const newQuestion = {
      id:                genId('q-custom'),
      order:             0,
      prompt:            { ko: prompt.trim() },
      hint:              hint && typeof hint === 'string' && hint.trim() ? { ko: hint.trim() } : null,
      estimated_minutes: 5,
      is_optional:       false,
      is_active:         true,
      is_custom:         true,
    };

    let insertIndex = ch.questions.length;
    if (afterQuestionId) {
      const idx = ch.questions.findIndex(q => q.id === afterQuestionId);
      if (idx >= 0) insertIndex = idx + 1;
    }
    ch.questions.splice(insertIndex, 0, newQuestion);
    ch.questions.forEach((q, i) => { q.order = i + 1; });

    await db.query(
      `INSERT INTO user_book_responses (book_id, user_id, question_id) VALUES ($1, $2, $3)`,
      [bookId, user.id, newQuestion.id]
    );

    const totalQuestions = countActiveQuestions(structure);

    await db.query(
      `UPDATE user_books
          SET structure       = $1::jsonb,
              total_questions = $2,
              last_active_at  = NOW()
        WHERE id = $3 AND user_id = $4`,
      [JSON.stringify(structure), totalQuestions, bookId, user.id]
    );

    return Response.json({ ok: true, question: newQuestion });
  } catch (e) {
    console.error('[POST /api/book/[id]/chapter/[chId]/question]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
