/**
 * POST /api/collections-book/generate
 *
 * 이야기책 PDF 다운로드 (Content-Disposition: attachment). preview 와 동일한
 * 본문/구조, 단 파일 저장용 헤더.
 *
 * 자서전 generate 와 달리 user_books 의 book_generated 플래그가 없음 (이야기책은
 * 책 단위 row 가 아니라 사용자의 collections 집합). 향후 필요하면 user_settings
 * 또는 별도 metadata 테이블에 추적 가능.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export const maxDuration = 30;

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  try {
    const uRes = await db.query(`SELECT lang FROM "User" WHERE id = $1`, [user.id]);
    const lang = (uRes.rows[0]?.lang || 'ko').toLowerCase();

    const { assembleStoryBookContent } = require('@/lib/storyBookGenerator');
    const { generatePdfBuffer }        = require('@/lib/bookPdf');

    const assembled = await assembleStoryBookContent({ userId: user.id, lang });
    if (!assembled.chapters.length) {
      return Response.json({
        error: 'no_chapters',
        message: '먼저 목차(챕터)를 만들고 이야기를 넣어주세요',
      }, { status: 400 });
    }

    const pdf = await generatePdfBuffer({ ...assembled, lang });

    // 파일명 — 사용자 lang 따라 default 제목, 한글이면 인코딩.
    const baseName = lang === 'en' ? 'My Stories'
                   : lang === 'es' ? 'Mis historias'
                   :                 '나의 이야기책';
    const safeName = encodeURIComponent(baseName) + '.pdf';

    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control':       'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (e) {
    console.error('[POST /api/collections-book/generate]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
