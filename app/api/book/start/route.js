/**
 * POST /api/book/start
 *
 * Body: { templateId: string, customTitle?: string }
 *
 * Creates (or resumes) a user_books row for the given template.
 * If the user already has an in_progress book on this template, we
 * return that book id (the partial unique index on user_books
 * (user_id, template_id) WHERE status='in_progress' guarantees we
 * never end up with two).
 *
 * On creation:
 *   • snapshot the template's default_structure into user_books.structure
 *     (each chapter/question gets is_active:true, is_custom:false)
 *   • bulk-insert empty user_book_responses rows, one per question
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const { templateId, customTitle } = body || {};
  if (!templateId) {
    return Response.json({ error: 'templateId required' }, { status: 400 });
  }

  const db = createDb();
  try {
    // 1. Template lookup
    const tmpl = await db.query(
      `SELECT id, name, default_structure
         FROM book_template_definitions
        WHERE id = $1 AND is_active = true`,
      [templateId]
    );
    if (tmpl.rows.length === 0) {
      return Response.json({ error: 'template not found' }, { status: 404 });
    }
    const template = tmpl.rows[0];

    // 2. Already in_progress? resume.
    const existing = await db.query(
      `SELECT id
         FROM user_books
        WHERE user_id = $1 AND template_id = $2 AND status = 'in_progress'`,
      [user.id, templateId]
    );
    if (existing.rows.length > 0) {
      return Response.json({ bookId: existing.rows[0].id, resumed: true });
    }

    // 3. Build the user-specific structure snapshot.
    //    Mark every node with is_active:true, is_custom:false so future
    //    edits (deactivate / customise) have a stable baseline.
    const baseStructure = template.default_structure || { chapters: [] };
    const structure = {
      ...baseStructure,
      chapters: (baseStructure.chapters || []).map(ch => ({
        ...ch,
        is_active: true,
        is_custom: false,
        questions: (ch.questions || []).map(q => ({
          ...q,
          is_active: true,
          is_custom: false,
        })),
      })),
    };

    // 🔥 Task 69 — defensive i18n completeness check on the snapshot.
    //   Doesn't block creation; just surfaces a server-side warning so
    //   we catch incomplete seeds in production before users ever see
    //   English leaking into a Korean book. The backfill script
    //   (scripts/backfill-book-structure-i18n.js) is the cure for
    //   already-broken books.
    {
      const issues = [];
      for (const ch of structure.chapters || []) {
        if (ch.is_custom) continue;
        for (const lang of ['ko', 'en', 'es']) {
          if (!ch.title?.[lang]) issues.push(`ch=${ch.id} title.${lang}`);
        }
        for (const q of ch.questions || []) {
          if (q.is_custom) continue;
          for (const lang of ['ko', 'en', 'es']) {
            if (!q.prompt?.[lang]) issues.push(`q=${q.id} prompt.${lang}`);
          }
        }
      }
      if (issues.length > 0) {
        console.warn(
          `[book/start] ⚠️ template=${templateId} incomplete i18n (${issues.length}):`,
          issues.slice(0, 5).join(', '),
          issues.length > 5 ? `… +${issues.length - 5} more` : ''
        );
      }
    }

    const totalQuestions = structure.chapters
      .reduce((sum, ch) => sum + (ch.questions?.length || 0), 0);
    const firstChapter   = structure.chapters[0];
    const firstQuestion  = firstChapter?.questions?.[0];

    const titleFromTemplate =
      template.name?.ko || template.name?.en || template.name?.es || 'My Book';
    const finalTitle = (customTitle && customTitle.trim()) || titleFromTemplate;

    // 4. Insert user_books row.
    const bookRow = await db.query(
      `INSERT INTO user_books
         (user_id, template_id, title, structure,
          total_questions, current_chapter_id, current_question_id, last_question_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $7)
       RETURNING id`,
      [
        user.id,
        templateId,
        finalTitle,
        JSON.stringify(structure),
        totalQuestions,
        firstChapter?.id || null,
        firstQuestion?.id || null,
      ]
    );
    const bookId = bookRow.rows[0].id;

    // 5. Bulk-insert empty response rows, one per question.
    const responseRows = [];
    for (const ch of structure.chapters) {
      for (const q of (ch.questions || [])) {
        responseRows.push([bookId, user.id, q.id]);
      }
    }

    if (responseRows.length > 0) {
      const placeholders = responseRows
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
        .join(', ');
      const flat = responseRows.flat();
      await db.query(
        `INSERT INTO user_book_responses (book_id, user_id, question_id)
         VALUES ${placeholders}`,
        flat
      );
    }

    return Response.json({
      bookId,
      resumed: false,
      totalQuestions,
      title: finalTitle,
    });
  } catch (e) {
    // 🔥 Task 71 — partial unique index (idx_user_books_one_in_progress)
    //   guarantees one in_progress book per (user_id, template_id).
    //   The resume SELECT above usually catches that case, but a
    //   concurrent double-tap can race past it; if it does, surface a
    //   409 with the existing book id so the client can route there
    //   instead of throwing a generic 500 at the senior.
    if (e.code === '23505' && /idx_user_books_one_in_progress/.test(String(e.message))) {
      try {
        const r = await createDb().query(
          `SELECT id FROM user_books
            WHERE user_id = $1 AND template_id = $2 AND status = 'in_progress'
            LIMIT 1`,
          [user.id, templateId]
        );
        if (r.rows.length > 0) {
          return Response.json(
            { bookId: r.rows[0].id, resumed: true, message: 'already in progress' },
            { status: 409 }
          );
        }
      } catch { /* fall through to generic 500 */ }
    }
    console.error('[POST /api/book/start]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
