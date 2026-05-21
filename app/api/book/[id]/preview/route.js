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

// Milestone 5 Step 4 (2026-05-21) — 게이트 사실상 제거 (Tim 결정).
//   답변 1개 이상이면 언제든 미리보기. PDF 는 무료, 인쇄($139)에 가치.
//   기존 PREVIEW_MIN_PERCENT (=10) 제거 — percent 대신 absolute 답변 수.
const PREVIEW_MIN_ANSWERED = 1;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId } = await params;
  const db = createDb();

  try {
    const bookRes = await db.query(
      `SELECT id, title, language, total_questions, completed_questions
         FROM user_books
        WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const book = bookRes.rows[0];
    // Milestone 5 Step 3 — 책 language 따르기 (영문책 → 영어 PDF, 한국어책 → 한국어).
    //   이전: lang: 'ko' 하드코딩 → 영문책도 한국어로 (Step B2 Fragment 버그와 동일 패턴).
    const bookLang = (book.language || 'ko').toLowerCase();
    const done  = book.completed_questions || 0;
    // Milestone 5 Step 4 — 답변 1개 이상이면 미리보기 가능.
    if (done < PREVIEW_MIN_ANSWERED) {
      return Response.json({
        error: 'no_answers',
        message: '이야기를 하나라도 들려주시면 미리볼 수 있어요',
        current_answered: done,
      }, { status: 400 });
    }

    const { assembleBookContent } = require('@/lib/bookGenerator');
    const { generatePdfBuffer }   = require('@/lib/bookPdf');

    const assembled = await assembleBookContent({
      bookId,
      userId: user.id,
      isPreview: true,
      lang: bookLang,
    });
    const pdf = await generatePdfBuffer({ ...assembled, lang: bookLang });

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
