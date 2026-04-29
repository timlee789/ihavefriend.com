/**
 * GET /api/book/templates
 *
 * List all active book templates (memoir, milestone, etc.).
 * Excludes the heavy default_structure column — call the per-id
 * endpoint to fetch the chapter/question tree.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  try {
    const result = await db.query(
      `SELECT id, name, description, category,
              estimated_chapters, estimated_questions,
              estimated_pages, estimated_days,
              is_premium, sort_order
         FROM book_template_definitions
        WHERE is_active = true
        ORDER BY sort_order ASC, id ASC`
    );
    return Response.json({ templates: result.rows });
  } catch (e) {
    console.error('[GET /api/book/templates]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
