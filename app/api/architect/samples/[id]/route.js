/**
 * GET /api/architect/samples/[id]
 *
 * 시나리오 상세 — structure (전체 chapters + questions tree) 포함.
 * 사용자가 시나리오 미리보기 페이지에서 호출.
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 *
 * Auth: requireAuth.
 *
 * Response (성공):
 *   {
 *     "sample": {
 *       "id": "sample-001",
 *       "display_label": "...",
 *       "language": "ko",
 *       "sort_order": 1,
 *       "is_active": true,
 *       "structure": { chapters: [{ id, title, questions: [...] }, ...] }
 *     }
 *   }
 *
 * 404 if id not found OR is_active=FALSE (사용자 노출 X).
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'id required' }, { status: 400 });
  }

  const db = createDb();
  try {
    const result = await db.query(
      `SELECT id, display_label, language, sort_order, is_active, structure
         FROM blueprint_samples
        WHERE id = $1
          AND is_active = TRUE`,
      [id]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'sample not found' }, { status: 404 });
    }

    const sample = result.rows[0];
    console.log(
      `[GET /api/architect/samples/${id}] user=${user.id} → ` +
      `${sample.structure?.chapters?.length || 0} chapters`
    );

    return Response.json({ sample });
  } catch (e) {
    console.error(`[GET /api/architect/samples/${id}]`, e?.message);
    return Response.json(
      { error: 'failed to load sample', detail: e?.message },
      { status: 500 }
    );
  }
}
