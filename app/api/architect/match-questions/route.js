/**
 * POST /api/architect/match-questions
 *
 * 특정 챕터의 question_library 후보를 사용자 키워드 + 챕터 맥락으로
 * 매칭. tags overlap 우선, 부족하면 chapter category 로 보강.
 *
 * Strategy: STRATEGY-architect-bot-final-2026-05-07.md
 *   사용자 keywords + chapterTags 합집합으로 GIN overlap 매칭. 부족하면
 *   chapterCategory 또는 chapterId 의 라이브러리 chapter category 로 보강.
 *
 * Body:
 *   {
 *     "chapterId":         "ch-008",        // optional — 라이브러리 chapter id (category 추론용)
 *     "chapterCategory":   "childhood",     // optional — chapterId 가 없을 때 직접
 *     "chapterTags":       ["시골", "어린"], // optional — chapter 의 tags (matching seed)
 *     "userKeywords":      ["어머니"],      // optional — 사용자가 추가 표현한 키워드
 *     "language":          "ko",            // optional, default 'ko'
 *     "limit":             7,               // optional, default 7, max 30
 *     "excludeIds":        []               // optional
 *   }
 *
 *   chapterTags / userKeywords / chapterCategory / chapterId 모두 옵션이지만
 *   최소 한 가지는 있어야 의미 있는 매칭이 됨.
 *
 * Response:
 *   {
 *     "questions":     [{ id, question_text, description, language, category,
 *                         tags, match_count }, ...],
 *     "fallback_used": boolean
 *   }
 */
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const DEFAULT_LIMIT = 7;
const MAX_LIMIT     = 30;

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const chapterId       = body?.chapterId ? String(body.chapterId) : null;
  const chapterCategory = body?.chapterCategory ? String(body.chapterCategory) : null;
  const chapterTags = Array.isArray(body?.chapterTags)
    ? body.chapterTags.map(t => String(t || '').trim()).filter(Boolean)
    : [];
  const userKeywords = Array.isArray(body?.userKeywords)
    ? body.userKeywords.map(k => String(k || '').trim()).filter(Boolean)
    : [];
  const language   = String(body?.language || 'ko').trim();
  const limit      = Math.min(MAX_LIMIT, Math.max(1, Number(body?.limit) || DEFAULT_LIMIT));
  const excludeIds = Array.isArray(body?.excludeIds)
    ? body.excludeIds.map(id => String(id || '')).filter(Boolean)
    : [];

  // userKeywords ∪ chapterTags 가 매칭 시드. 둘 다 없고 chapter 식별자도
  // 없으면 의미 있는 결과를 만들 방법이 없음.
  const matchKeywords = [...new Set([...userKeywords, ...chapterTags])];
  if (matchKeywords.length === 0 && !chapterId && !chapterCategory) {
    return Response.json(
      { error: 'need at least one of: userKeywords, chapterTags, chapterId, chapterCategory' },
      { status: 400 }
    );
  }

  try {
    let questions = [];
    let fallbackUsed = false;

    // ── Pass 1 — tags overlap if we have keywords ──
    if (matchKeywords.length > 0) {
      const tagMatches = await prisma.$queryRaw`
        SELECT
          ql.*,
          (SELECT COUNT(*)::int
             FROM unnest(ql.tags) AS t
            WHERE t = ANY(${matchKeywords}::text[])) AS match_count
        FROM question_library ql
        WHERE ql.language = ${language}
          AND ql.tags && ${matchKeywords}::text[]
          AND ql.id != ALL(${excludeIds}::text[])
        ORDER BY match_count DESC NULLS LAST
        LIMIT ${limit}
      `;
      questions = Array.isArray(tagMatches) ? tagMatches : [];
    }

    // ── Pass 2 — category fallback ──
    if (questions.length < limit) {
      // chapterCategory 우선, 없으면 chapterId 로 라이브러리 lookup.
      let category = chapterCategory;
      if (!category && chapterId) {
        const ch = await prisma.chapterLibrary.findUnique({
          where: { id: chapterId },
          select: { category: true },
        });
        category = ch?.category || null;
      }

      if (category) {
        const seenIds  = questions.map(q => q.id);
        const exclude2 = [...excludeIds, ...seenIds];
        const need     = limit - questions.length;

        const catMatches = await prisma.$queryRaw`
          SELECT
            ql.*,
            0::int AS match_count
          FROM question_library ql
          WHERE ql.language = ${language}
            AND ql.category = ${category}
            AND ql.id != ALL(${exclude2}::text[])
          ORDER BY ql.id ASC
          LIMIT ${need}
        `;
        if (Array.isArray(catMatches) && catMatches.length > 0) {
          questions = [...questions, ...catMatches];
          fallbackUsed = true;
        }
      }
    }

    console.log(
      `[POST /api/architect/match-questions] user=${user.id} ` +
      `chapter=${chapterId || chapterCategory || '-'} ` +
      `kw=[${matchKeywords.join(',')}] → ${questions.length} (fallback=${fallbackUsed})`
    );

    return Response.json({ questions, fallback_used: fallbackUsed });
  } catch (e) {
    console.error('[POST /api/architect/match-questions]', e?.message);
    return Response.json(
      { error: 'match failed', detail: e?.message },
      { status: 500 }
    );
  }
}
