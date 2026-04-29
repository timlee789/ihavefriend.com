/**
 * GET /api/book/[id]/progress
 *
 * Returns the book overview: progress %, suggested next question,
 * and a list of chapters (without questions[] — chapter detail is
 * a separate endpoint to keep this payload small).
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId } = await params;
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

    const respRes = await db.query(
      `SELECT question_id, status, fragment_ids, imported_fragment_ids
         FROM user_book_responses WHERE book_id = $1`,
      [bookId]
    );
    const responseMap = Object.create(null);
    for (const r of respRes.rows) responseMap[r.question_id] = r;

    const structure = book.structure || { chapters: [] };
    let completedCount = 0;

    const chapters = (structure.chapters || [])
      .filter(ch => ch.is_active !== false)
      .map(ch => {
        const qs = (ch.questions || [])
          .filter(q => q.is_active !== false)
          .map(q => {
            const resp = responseMap[q.id] || { status: 'empty' };
            if (resp.status === 'complete') completedCount++;
            return {
              id: q.id,
              order: q.order,
              prompt: q.prompt,
              hint: q.hint,
              estimated_minutes: q.estimated_minutes,
              is_optional: q.is_optional || false,
              is_custom: q.is_custom || false,
              status: resp.status,
              fragment_count:
                (resp.fragment_ids || []).length +
                (resp.imported_fragment_ids || []).length,
            };
          });

        const chCompleted = qs.filter(q => q.status === 'complete').length;
        const chTotal = qs.length;
        let chStatus = 'not_started';
        if (chCompleted === chTotal && chTotal > 0) chStatus = 'complete';
        else if (chCompleted > 0) chStatus = 'in_progress';

        return {
          id: ch.id,
          order: ch.order,
          title: ch.title,
          description: ch.description,
          is_custom: ch.is_custom || false,
          completed: chCompleted,
          total: chTotal,
          status: chStatus,
          is_current: ch.id === book.current_chapter_id,
          questions: qs,
        };
      });

    // Suggested next: first empty question in the first non-complete chapter
    let suggestedNext = null;
    for (const ch of chapters) {
      if (ch.status === 'complete') continue;
      const nextQ = ch.questions.find(q => q.status === 'empty');
      if (nextQ) {
        suggestedNext = {
          chapter_id: ch.id,
          chapter_title: ch.title,
          question_id: nextQ.id,
          prompt: nextQ.prompt,
          hint: nextQ.hint,
          estimated_minutes: nextQ.estimated_minutes,
        };
        break;
      }
    }

    const totalActive = chapters.reduce((s, ch) => s + ch.total, 0);
    const completionPercent =
      totalActive > 0 ? Math.round((completedCount / totalActive) * 100) : 0;

    return Response.json({
      book: {
        id: book.id,
        template_id: book.template_id,
        title: book.title,
        status: book.status,
        view_mode: book.view_mode,
        started_at: book.started_at,
        last_active_at: book.last_active_at,
        total_questions: totalActive,
        completed_questions: completedCount,
        completion_percent: completionPercent,
        book_eligible: completionPercent >= 50,
        book_recommended: completionPercent >= 80,
        book_generated: book.book_generated,
        book_pdf_url: book.book_pdf_url,
      },
      suggested_next: suggestedNext,
      chapters: chapters.map(ch => ({ ...ch, questions: undefined })),
    });
  } catch (e) {
    console.error('[GET /api/book/[id]/progress]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
