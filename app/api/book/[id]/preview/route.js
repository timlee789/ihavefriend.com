/**
 * POST /api/book/[id]/preview
 *
 * Streams a PDF preview of the book. Gated at 30% completion. AI
 * chapter intros are skipped (isPreview=true) so the response is
 * fast — the user just wants to see what they have so far. We don't
 * persist the PDF anywhere; the user re-generates whenever they want
 * a fresh look.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export const maxDuration = 60;

const PREVIEW_MIN_PERCENT = 30;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId } = await params;
  const db = createDb();

  try {
    const bookRes = await db.query(
      `SELECT id, title, total_questions, completed_questions
         FROM user_books
        WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const book = bookRes.rows[0];
    const total = book.total_questions || 0;
    const done  = book.completed_questions || 0;
    const percent = total > 0 ? (done / total) * 100 : 0;
    if (percent < PREVIEW_MIN_PERCENT) {
      return Response.json({
        error: 'too_early',
        message: `미리보기는 ${PREVIEW_MIN_PERCENT}% 이상 완성 후 가능해요`,
        current_percent: Math.round(percent),
      }, { status: 400 });
    }

    const { assembleBookContent } = require('@/lib/bookGenerator');
    const { generatePdfBuffer }   = require('@/lib/bookPdf');

    const assembled = await assembleBookContent({
      bookId,
      userId: user.id,
      isPreview: true,
    });
    const pdf = await generatePdfBuffer({ ...assembled, lang: 'ko' });

    const safeName = encodeURIComponent((book.title || 'book') + '_preview') + '.pdf';
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (e) {
    console.error('[POST /api/book/[id]/preview]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
