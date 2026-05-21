/**
 * POST /api/collections-book/preview
 *
 * 이야기책 (collections) PDF 미리보기. 새 탭에 inline PDF 표시.
 *
 * 자서전 /api/book/[id]/preview 와 동일 패턴이지만 데이터 소스가 다름:
 *   자서전:   user_books.structure → bookGenerator.assembleBookContent
 *   이야기책: user_collections + collection_fragments → storyBookGenerator.assembleStoryBookContent
 *
 * PDF 렌더는 자서전과 동일한 lib/bookPdf.js (generatePdfBuffer) 재사용.
 *
 * 게이트: collection 1개 이상 + 그 안에 fragment 1개 이상 (assemble 결과
 * chapters.length === 0 면 no_chapters). PDF 는 무료라 별도 진행률 게이트 없음.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export const maxDuration = 30;

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  try {
    // 사용자 언어 (User.lang) — 자서전은 책 단위 language, 이야기책은 사용자 단위.
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

    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': 'inline; filename="storybook-preview.pdf"',
        'Cache-Control':       'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (e) {
    console.error('[POST /api/collections-book/preview]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
