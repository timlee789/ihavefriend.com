/**
 * GET /api/books/download/:bookId
 * Returns the PDF as an attachment.
 * Only allowed when status = 'completed' and output_data is present.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { bookId } = await params;
  if (!bookId) return Response.json({ error: 'bookId required' }, { status: 400 });

  const db = createDb();

  try {
    const res = await db.query(`
      SELECT id, title, status, output_data
      FROM books
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `, [bookId, user.id]);

    const book = res.rows[0];

    if (!book) {
      return Response.json({ error: '존재하지 않는 ebook입니다.' }, { status: 404 });
    }
    if (book.status !== 'completed') {
      return Response.json({ error: 'ebook이 아직 준비되지 않았습니다.' }, { status: 403 });
    }
    if (!book.output_data) {
      return Response.json({ error: 'PDF 파일이 아직 없습니다.' }, { status: 404 });
    }

    // output_data is stored as base64 by the 5090 runner
    const pdfBuffer = Buffer.from(book.output_data, 'base64');
    const safeTitle = book.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim() || 'ebook';

    console.log(`[GET /api/books/download] bookId=${bookId} userId=${user.id} size=${pdfBuffer.length}`);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type'       : 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.pdf`,
        'Content-Length'     : String(pdfBuffer.length),
        'Cache-Control'      : 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[GET /api/books/download]', e.message);
    return Response.json({ error: '다운로드에 실패했습니다.' }, { status: 500 });
  }
}
