/**
 * POST /api/book/[id]/generate
 *
 * Streams the "real" PDF — same renderer as the preview path but
 * with AI chapter intros included. Gated at 50% completion. Stamps
 * book_generated=true + book_generated_at on success. The PDF body
 * itself is not persisted yet (Vercel Blob is the natural production
 * landing spot) — for now the client downloads it directly from this
 * response and can re-trigger any time.
 *
 * maxDuration is 60 (Vercel Hobby limit). With Gemini Flash chapter
 * intros at ~3s each and a 9-chapter memoir, generation lands around
 * 30–45 s. If the timeout starts biting we'd cut over to the bg-job
 * + polling pattern; for the first ship the synchronous path is
 * simpler and the user gets their book on a single click.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export const maxDuration = 60;

const GENERATE_MIN_PERCENT = 50;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId } = await params;
  const db = createDb();

  try {
    const bookRes = await db.query(
      `SELECT id, title, total_questions, completed_questions, book_generated
         FROM user_books
        WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const book  = bookRes.rows[0];
    const total = book.total_questions || 0;
    const done  = book.completed_questions || 0;
    const percent = total > 0 ? (done / total) * 100 : 0;
    if (percent < GENERATE_MIN_PERCENT) {
      return Response.json({
        error: 'insufficient_progress',
        message: `책 만들기는 ${GENERATE_MIN_PERCENT}% 이상 완성 후 가능해요`,
        current_percent: Math.round(percent),
      }, { status: 400 });
    }

    const { assembleBookContent } = require('@/lib/bookGenerator');
    const { generatePdfBuffer }   = require('@/lib/bookPdf');

    const assembled = await assembleBookContent({
      bookId,
      userId: user.id,
      isPreview: false,
    });
    const pdf = await generatePdfBuffer({ ...assembled, lang: 'ko' });

    // Mark the book as generated. We don't store the PDF body itself
    //   yet — the user downloads from this response. Future: write a
    //   Vercel Blob URL into book_pdf_url and treat this endpoint as
    //   "trigger re-generation".
    await db.query(
      `UPDATE user_books
          SET book_generated    = true,
              book_generated_at = NOW(),
              last_active_at    = NOW()
        WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );

    const safeName = encodeURIComponent(book.title || 'book') + '.pdf';
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (e) {
    console.error('[POST /api/book/[id]/generate]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
