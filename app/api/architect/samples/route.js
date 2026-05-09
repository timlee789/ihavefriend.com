/**
 * GET /api/architect/samples?language=ko
 *
 * 시나리오 (blueprint_samples) 목록 — 사용자 페이지에서 시나리오 카드
 * 5개를 표시하는 데 사용. structure (heavy JSONB) 는 제외하고 카운트만.
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 *
 * Auth: requireAuth (시나리오 자체는 공개 데이터지만 사용자 진입은 로그인 가정).
 *
 * Response:
 *   {
 *     "samples": [
 *       { "id": "sample-001", "display_label": "...", "language": "ko",
 *         "sort_order": 1, "is_active": true, "chapter_count": 8 },
 *       ...
 *     ]
 *   }
 *
 * Notes:
 *   - is_active=TRUE 만 (관리자가 비활성화한 시나리오는 사용자 노출 X)
 *   - chapter_count = jsonb_array_length(structure->'chapters')
 *   - structure 컬럼 자체는 응답에서 제외 (각 sample 30+ KB, 5개=150 KB)
 *     상세는 /api/architect/samples/[id] 에서 가져옴.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const url = new URL(request.url);
  const language = (url.searchParams.get('language') || 'ko').trim();

  const db = createDb();
  try {
    const result = await db.query(
      `SELECT id, display_label, language, sort_order, is_active,
              jsonb_array_length(structure->'chapters') AS chapter_count
         FROM blueprint_samples
        WHERE language = $1
          AND is_active = TRUE
        ORDER BY sort_order ASC`,
      [language]
    );

    console.log(
      `[GET /api/architect/samples] user=${user.id} lang=${language} → ${result.rows.length} samples`
    );

    return Response.json({ samples: result.rows });
  } catch (e) {
    console.error('[GET /api/architect/samples]', e?.message);
    return Response.json(
      { error: 'failed to load samples', detail: e?.message },
      { status: 500 }
    );
  }
}
