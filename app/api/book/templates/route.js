/**
 * GET /api/book/templates
 *
 * List all active book templates (memoir, milestone, etc.).
 * Excludes the heavy default_structure column — call the per-id
 * endpoint to fetch the chapter/question tree.
 *
 * Stage 8 (i18n): supports an optional ?lang=ko|en|es filter so /book/select
 * can show only the templates that match the user's language. When the
 * filter is omitted (or invalid) the endpoint returns every active template
 * for backwards compatibility.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

const ALLOWED_LANGS = new Set(['ko', 'en', 'es']);

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const url = new URL(request.url);
  const langParam = (url.searchParams.get('lang') || '').toLowerCase();
  const lang = ALLOWED_LANGS.has(langParam) ? langParam : null;

  const db = createDb();
  try {
    const baseCols = `id, name, description, category, language,
                      estimated_chapters, estimated_questions,
                      estimated_pages, estimated_days,
                      is_premium, sort_order`;
    const result = lang
      ? await db.query(
          `SELECT ${baseCols}
             FROM book_template_definitions
            WHERE is_active = true AND language = $1
            ORDER BY sort_order ASC, id ASC`,
          [lang]
        )
      : await db.query(
          `SELECT ${baseCols}
             FROM book_template_definitions
            WHERE is_active = true
            ORDER BY sort_order ASC, id ASC`
        );
    return Response.json({ templates: result.rows, lang });
  } catch (e) {
    console.error('[GET /api/book/templates]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
