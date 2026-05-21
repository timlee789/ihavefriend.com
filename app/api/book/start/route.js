/**
 * POST /api/book/start
 *
 * Body:
 *   {
 *     templateId?:  string,   // legacy — book_template_definitions
 *     sampleId?:    string,   // 🆕 V2 — blueprint_samples (Architect Bot)
 *     customTitle?: string,
 *   }
 *   templateId 또는 sampleId 둘 중 하나는 필수. 둘 다 있으면 sampleId 우선
 *   (V2 가 새 길). templates 는 V2 cleanup 으로 모두 is_active=false.
 *
 * Creates (or resumes) a user_books row.
 * If the user already has an in_progress book on this template OR sample,
 * we return that book id (partial unique index on user_books
 * (user_id, template_category) WHERE status='in_progress' guarantees we
 * never end up with two memoir books).
 *
 * On creation:
 *   • snapshot the source structure into user_books.structure
 *     (each chapter/question gets is_active:true, is_custom:false)
 *   • bulk-insert empty user_book_responses rows, one per question
 */
import { requireAuth } from '@/lib/auth';
import { checkQuotaOrError } from '@/lib/quotas';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const { templateId, sampleId, customTitle } = body || {};
  if (!templateId && !sampleId) {
    return Response.json({ error: 'templateId or sampleId required' }, { status: 400 });
  }

  // 🔥 V2 (2026-05-09) — sampleId branch.
  //   blueprint_samples (Architect Bot) — Tim 큐레이션 5 시나리오.
  //   sampleId 가 있으면 우선 (templateId 가 같이 와도 sample 선택).
  //   templates 는 V2 cleanup 으로 모두 inactive 상태이므로 실질적으로
  //   새로운 book 생성은 sample 경로만 동작. 기존 template 기반 in_progress
  //   book 은 resume 가능 (아래 분기). 자세한 strategy:
  //     STRATEGY-architect-bot-final-V2-2026-05-08.md
  if (sampleId) {
    return await startFromSample({ user, sampleId, customTitle });
  }

  const db = createDb();
  try {
    // 1. Template lookup — pull category too (Task 73 dedups per category).
    const tmpl = await db.query(
      `SELECT id, name, category, default_structure
         FROM book_template_definitions
        WHERE id = $1 AND is_active = true`,
      [templateId]
    );
    if (tmpl.rows.length === 0) {
      return Response.json({ error: 'template not found' }, { status: 404 });
    }
    const template = tmpl.rows[0];

    // 2. 🔥 Task 73 — Resume by CATEGORY, not template_id. A senior
    //    who started memoir-ko then toggles to EN and taps "Make my
    //    book" should resume the same memoir, not start a new one.
    const existing = await db.query(
      `SELECT id, template_id
         FROM user_books
        WHERE user_id = $1
          AND template_category = $2
          AND status = 'in_progress'`,
      [user.id, template.category]
    );
    if (existing.rows.length > 0) {
      return Response.json({
        bookId:   existing.rows[0].id,
        resumed:  true,
        crossLang: existing.rows[0].template_id !== templateId,
      });
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

    // 🔥 V3 Step 1e — language 명시 저장. template_id 끝의 lang suffix
    //   (memoir-ko / memoir-en / memoir-es) 에서 derive, 매칭 안 되면 'ko'.
    const langMatch = (templateId || '').match(/-(ko|en|es)$/);
    const bookLang = langMatch ? langMatch[1] : 'ko';

    // 4. Insert user_books row.
    //    🔥 Task 73 — denormalize template.category onto user_books
    //    so the partial unique index can dedup at category level.
    const bookRow = await db.query(
      `INSERT INTO user_books
         (user_id, template_id, template_category, title, structure, language,
          total_questions, current_chapter_id, current_question_id, last_question_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $9)
       RETURNING id`,
      [
        user.id,
        templateId,
        template.category,
        finalTitle,
        JSON.stringify(structure),
        bookLang,
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
    // 🔥 Task 73 — partial unique index now lives on
    //   (user_id, template_category) (idx_user_books_one_per_category).
    //   The resume SELECT above usually catches that case, but a
    //   concurrent double-tap can race past it; if it does, surface a
    //   409 with the existing book id so the client can route there
    //   instead of throwing a generic 500 at the senior. We accept
    //   either the new or the legacy index name in the error message
    //   for safety during the rollout window.
    if (
      e.code === '23505' &&
      /idx_user_books_one_(?:in_progress|per_category)/.test(String(e.message))
    ) {
      try {
        // Look up by category — that's the dedup unit now. We need
        // template.category, which lives on the row we tried to
        // insert; pull it from the template again.
        const tmplLookup = await createDb().query(
          `SELECT category FROM book_template_definitions WHERE id = $1`,
          [templateId]
        );
        const cat = tmplLookup.rows[0]?.category;
        const r = await createDb().query(
          `SELECT id FROM user_books
            WHERE user_id = $1 AND template_category = $2 AND status = 'in_progress'
            LIMIT 1`,
          [user.id, cat]
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

// ─────────────────────────────────────────────────────────────────
// 🆕 V2 (2026-05-09) — sample-based start (Architect Bot)
// ─────────────────────────────────────────────────────────────────
//
// blueprint_samples (Tim 큐레이션 시나리오 5개) 에서 user_books 를
// 만들거나 resume. template path 와 동일한 user_books / user_book_responses
// 패턴을 그대로 따르고, 다음만 다름:
//   - template_id: NULL
//   - template_category: 'memoir' (Architect Bot 전체가 자서전)
//   - source_sample_id: sampleId (FK 추적)
//
// 중복 방지:
//   1) source_sample_id 기준 in-progress 우선 resume (V2 native dedup)
//   2) (user_id, template_category) partial unique index 가 23505 던지면
//      그 카테고리의 in-progress book 으로 fallback resume
//      (예: 같은 user 가 template-based memoir 를 이미 가진 상태)
async function startFromSample({ user, sampleId, customTitle }) {
  const db = createDb();
  try {
    // 1. 시나리오 lookup (active 만)
    const sampleRow = await db.query(
      `SELECT id, display_label, language, structure
         FROM blueprint_samples
        WHERE id = $1 AND is_active = TRUE`,
      [sampleId]
    );
    if (sampleRow.rows.length === 0) {
      return Response.json({ error: 'sample not found' }, { status: 404 });
    }
    const sample = sampleRow.rows[0];

    // 2. 같은 sample 의 in-progress book 이 있으면 resume
    const existingSample = await db.query(
      `SELECT id
         FROM user_books
        WHERE user_id = $1
          AND source_sample_id = $2
          AND status = 'in_progress'
        LIMIT 1`,
      [user.id, sampleId]
    );
    if (existingSample.rows.length > 0) {
      return Response.json({
        bookId:  existingSample.rows[0].id,
        resumed: true,
        source:  'sample',
      });
    }

    // 🔥 Sprint 2j (2026-05-11) — maxBooks quota (per kind = memoir).
    //   Resume path 위에서 통과 (기존 책 재진입은 limit X). 새 memoir 생성 시점만 체크.
    const cntRes = await db.query(
      `SELECT COUNT(*)::int AS n FROM user_books
        WHERE user_id = $1 AND template_category = 'memoir'`,
      [user.id]
    );
    const cnt = cntRes.rows[0]?.n || 0;
    const check = await checkQuotaOrError(user.id, 'maxBooks', cnt);
    if (!check.ok) {
      return Response.json(check.error, { status: 403 });
    }

    // 3. structure snapshot — template path 와 동일한 markers 추가.
    //    is_active:true (사용자가 비활성 가능) / is_custom:false (라이브러리
    //    원본). 사용자가 편집기에서 추가/수정한 항목은 is_custom:true 로 마킹.
    const baseStructure = sample.structure || { chapters: [] };
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

    const totalQuestions = structure.chapters
      .reduce((sum, ch) => sum + (ch.questions?.length || 0), 0);
    const firstChapter   = structure.chapters[0];
    const firstQuestion  = firstChapter?.questions?.[0];

    const finalTitle =
      (customTitle && customTitle.trim()) ||
      sample.display_label ||
      '내 자서전';

    // 4. INSERT user_books — template_id NULL, source_sample_id 채움.
    //    🔥 V3 Step 1e — language 는 sample.language 그대로 (line 251 SELECT 에 포함).
    //    현재 모든 시드가 ko 라서 신규 영문/스페인어 책은 별도 시드 + UPDATE 필요.
    let bookRow;
    try {
      bookRow = await db.query(
        `INSERT INTO user_books
           (user_id, template_id, template_category, source_sample_id,
            title, structure, language, total_questions,
            current_chapter_id, current_question_id, last_question_id)
         VALUES ($1, NULL, 'memoir', $2, $3, $4::jsonb, $5, $6, $7, $8, $8)
         RETURNING id`,
        [
          user.id,
          sampleId,
          finalTitle,
          JSON.stringify(structure),
          sample.language || 'ko',
          totalQuestions,
          firstChapter?.id || null,
          firstQuestion?.id || null,
        ]
      );
    } catch (e) {
      // (user_id, template_category) partial unique index — 같은 카테고리의
      // in-progress book 이 이미 있을 때 (템플릿이든 다른 시나리오든).
      // 그 book 을 resume 로 반환.
      if (
        e.code === '23505' &&
        /idx_user_books_one_(?:in_progress|per_category)/.test(String(e.message))
      ) {
        const r = await db.query(
          `SELECT id FROM user_books
            WHERE user_id = $1 AND template_category = 'memoir' AND status = 'in_progress'
            LIMIT 1`,
          [user.id]
        );
        if (r.rows.length > 0) {
          return Response.json(
            {
              bookId:  r.rows[0].id,
              resumed: true,
              source:  'sample',
              message: 'memoir already in progress (different sample/template)',
            },
            { status: 409 }
          );
        }
      }
      throw e;
    }
    const bookId = bookRow.rows[0].id;

    // 5. Bulk-insert empty response rows (template path 와 동일).
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
      title:   finalTitle,
      source:  'sample',
    });
  } catch (e) {
    console.error('[POST /api/book/start sampleId]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
