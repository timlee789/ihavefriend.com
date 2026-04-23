/**
 * GET /api/books/status
 * Returns the user's ebook list with status info.
 *
 * 2026-04-23 v2 schema migration:
 *  - status != 'draft' → parameterized + cast ::"BookStatus"
 *  - Response status values converted to lowercase
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { bookStatusToDb, bookStatusFromDb } from '@/lib/enumMappers';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();

  try {
    const res = await db.query(`
      SELECT
        id, title, status, dedication,
        auto_preface, auto_epilogue,
        fragment_ids,
        created_at, updated_at,
        -- Don't send output_data (could be huge) — only signal availability
        (output_data IS NOT NULL) AS has_output
      FROM books
      WHERE user_id = $1
        AND status != $2::"BookStatus"
      ORDER BY created_at DESC
      LIMIT 20
    `, [user.id, bookStatusToDb('draft')]);

    // Convert status back to lowercase for API consumers
    const books = res.rows.map(row => ({
      ...row,
      status: bookStatusFromDb(row.status),
    }));

    return Response.json({ books });
  } catch (e) {
    console.error('[GET /api/books/status]', e.message);
    return Response.json({ error: '상태 조회에 실패했습니다.' }, { status: 500 });
  }
}
