/**
 * GET /api/book/templates/[id]
 *
 * Returns the full template row including default_structure
 * (chapters[] → questions[]) so the client can render the tree.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = await params;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const db = createDb();
  try {
    const result = await db.query(
      `SELECT id, name, description, category, default_structure,
              estimated_chapters, estimated_questions, estimated_pages,
              estimated_days, is_premium, sort_order, created_at, updated_at
         FROM book_template_definitions
        WHERE id = $1 AND is_active = true`,
      [id]
    );
    if (result.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    return Response.json({ template: result.rows[0] });
  } catch (e) {
    console.error('[GET /api/book/templates/[id]]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
