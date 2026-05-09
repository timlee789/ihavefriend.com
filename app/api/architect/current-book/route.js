/**
 * GET /api/architect/current-book
 *
 * 사용자의 현재 진행 중 자서전 (1개) 을 반환. /architect 와
 * /architect/sample/[id] 가 페이지 진입 직전 호출 — 이미 자서전이
 * 있으면 즉시 /book/[id] 로 redirect 시키기 위해.
 *
 * Tim 정책 (2026-05-09):
 *   "유저는 하나의 자서전과 하나의 목차 하나의 소단락 질문만 가질 수 있어야 한다"
 *   DB level partial unique index (idx_user_books_one_per_category) 가
 *   이미 강제. 이 endpoint 는 frontend 가 그 사실을 알게 해주는 hint.
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 *
 * Auth: requireAuth.
 *
 * Response:
 *   - 진행 중 자서전 없음:
 *     { "hasBook": false }
 *   - 있음:
 *     {
 *       "hasBook": true,
 *       "book": {
 *         "id":                  "...",
 *         "title":               "...",
 *         "source_sample_id":    "sample-001" | null,
 *         "template_id":         "memoir-ko"  | null,
 *         "total_questions":     37,
 *         "completed_questions": 12
 *       }
 *     }
 *
 * NOTE: user_books 테이블은 Prisma 모델이 아닌 raw SQL 로만 접근하는
 *   convention (photobook + memoir flow 일관). createDb 에서 Pool 를 받아
 *   사용. template_category='memoir' 로 필터링 (Architect Bot 는 자서전만).
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  try {
    const result = await db.query(
      `SELECT id, title, source_sample_id, template_id,
              total_questions, completed_questions
         FROM user_books
        WHERE user_id = $1
          AND template_category = 'memoir'
          AND status = 'in_progress'
        ORDER BY started_at DESC
        LIMIT 1`,
      [user.id]
    );

    if (result.rows.length === 0) {
      return Response.json({ hasBook: false });
    }

    return Response.json({ hasBook: true, book: result.rows[0] });
  } catch (e) {
    console.error('[GET /api/architect/current-book]', e?.message);
    return Response.json(
      { error: 'failed to load current book', detail: e?.message },
      { status: 500 }
    );
  }
}
