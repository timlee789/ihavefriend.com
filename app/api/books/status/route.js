/**
 * GET /api/books/status
 * Returns the user's ebook list with status info.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

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
        AND status != 'draft'
      ORDER BY created_at DESC
      LIMIT 20
    `, [user.id]);

    return Response.json({ books: res.rows });
  } catch (e) {
    console.error('[GET /api/books/status]', e.message);
    return Response.json({ error: '상태 조회에 실패했습니다.' }, { status: 500 });
  }
}
