/**
 * GET /api/architect/general-chapters?language=ko
 *
 * Returns Tim 큐레이션 일반 목차 7개 (chapter_library where is_general).
 *
 * Strategy: STRATEGY-architect-bot-final-2026-05-07.md
 *   "사용자 시작 시 일반 목차 7개" — Architect Bot 의 첫 화면이 사용자에게
 *   보여주는 출발 시드. 이 위에서 사용자가 변경(삭제/추가/순서)을 시작.
 *
 * Auth: requireAuth (other architect routes 는 logApiUsage 로 user.id
 * 가 필요하니 일관되게 모두 인증 필수).
 *
 * Notes:
 *   - is_general 필드는 chapter_library 7개 row 만 TRUE.
 *   - language 미지정 시 'ko' default. 'en'/'es' 도 데이터가 있으면
 *     동작하지만 베타엔 ko 만 시드됨.
 */
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const url = new URL(request.url);
  const language = (url.searchParams.get('language') || 'ko').trim();

  try {
    const chapters = await prisma.chapterLibrary.findMany({
      where: { isGeneral: true, language },
      orderBy: { sortOrder: 'asc' },
    });

    console.log(
      `[GET /api/architect/general-chapters] user=${user.id} lang=${language} → ${chapters.length} rows`
    );

    return Response.json({ chapters });
  } catch (e) {
    console.error('[GET /api/architect/general-chapters]', e?.message);
    return Response.json(
      { error: 'failed to load general chapters', detail: e?.message },
      { status: 500 }
    );
  }
}
