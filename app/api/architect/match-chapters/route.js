/**
 * POST /api/architect/match-chapters
 *
 * Tim 큐레이션 chapter_library 에서 사용자 키워드와 매칭되는 챕터 후보
 * 를 반환. tags GIN overlap 우선, 부족하면 categoryHints 로 보강.
 *
 * Strategy: STRATEGY-architect-bot-final-2026-05-07.md
 *   매칭 알고리즘 — tags(GIN) overlap → category 보강. 정답 X, 영감 트리거.
 *
 * Body:
 *   {
 *     "keywords":   ["시골", "어린", "농촌"],   // required
 *     "language":   "ko",                       // optional, default 'ko'
 *     "limit":      5,                          // optional, default 5, max 20
 *     "excludeIds": ["ch-001"]                  // optional, 이미 채택된 챕터 제외
 *   }
 *
 * Response:
 *   {
 *     "chapters":      [{ id, title, description, language, category, tags,
 *                         is_general, sort_order, match_count }, ...],
 *     "fallback_used": boolean    // tags 매칭 부족해서 category 보강한 경우 true
 *   }
 *
 * SQL note:
 *   Postgres 에는 `text[] & text[]` (intersection) 가 없어서
 *   strategy 의 array_length(tags & ...) 는 작동 안 함. 대신
 *   COUNT(unnest()) WHERE x = ANY($1) 서브쿼리로 match_count 계산.
 *   GIN index 는 `&&` (overlap) 에 그대로 적용됨.
 */
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

const { categoriesFromKeywords } = require('@/lib/architect/categoryHints');

const DEFAULT_LIMIT = 5;
const MAX_LIMIT     = 20;

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const keywords = Array.isArray(body?.keywords)
    ? body.keywords.map(k => String(k || '').trim()).filter(Boolean)
    : [];
  const language   = String(body?.language || 'ko').trim();
  const limit      = Math.min(MAX_LIMIT, Math.max(1, Number(body?.limit) || DEFAULT_LIMIT));
  const excludeIds = Array.isArray(body?.excludeIds)
    ? body.excludeIds.map(id => String(id || '')).filter(Boolean)
    : [];

  if (keywords.length === 0) {
    return Response.json({ error: 'keywords (non-empty array) required' }, { status: 400 });
  }

  try {
    // ── Pass 1 — tags overlap (GIN-accelerated) + match_count ranking ──
    // Empty array literal trick: `id != ALL(ARRAY[]::text[])` always TRUE,
    // so excludeIds=[] doesn't filter anything.
    const tagMatches = await prisma.$queryRaw`
      SELECT
        cl.*,
        (SELECT COUNT(*)::int
           FROM unnest(cl.tags) AS t
          WHERE t = ANY(${keywords}::text[])) AS match_count
      FROM chapter_library cl
      WHERE cl.language = ${language}
        AND cl.tags && ${keywords}::text[]
        AND cl.id != ALL(${excludeIds}::text[])
      ORDER BY match_count DESC NULLS LAST,
               cl.sort_order ASC
      LIMIT ${limit}
    `;

    let chapters = Array.isArray(tagMatches) ? tagMatches : [];
    let fallbackUsed = false;

    // ── Pass 2 — category fallback (only if tag matches under-fill) ──
    if (chapters.length < limit) {
      const cats = categoriesFromKeywords(keywords);
      if (cats.length > 0) {
        const seenIds  = chapters.map(c => c.id);
        const exclude2 = [...excludeIds, ...seenIds];
        const need     = limit - chapters.length;

        const catMatches = await prisma.$queryRaw`
          SELECT
            cl.*,
            0::int AS match_count
          FROM chapter_library cl
          WHERE cl.language = ${language}
            AND cl.category = ANY(${cats}::text[])
            AND cl.id != ALL(${exclude2}::text[])
          ORDER BY cl.sort_order ASC
          LIMIT ${need}
        `;
        if (Array.isArray(catMatches) && catMatches.length > 0) {
          chapters = [...chapters, ...catMatches];
          fallbackUsed = true;
        }
      }
    }

    console.log(
      `[POST /api/architect/match-chapters] user=${user.id} keywords=[${keywords.join(',')}] ` +
      `→ ${chapters.length} chapters (fallback=${fallbackUsed})`
    );

    return Response.json({ chapters, fallback_used: fallbackUsed });
  } catch (e) {
    console.error('[POST /api/architect/match-chapters]', e?.message);
    return Response.json(
      { error: 'match failed', detail: e?.message },
      { status: 500 }
    );
  }
}
