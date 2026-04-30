#!/usr/bin/env node
/**
 * scripts/refresh-book-structures.js  (Task 69)
 *
 * Re-syncs every user_books.structure with the current
 * book_template_definitions.default_structure for the matching
 * template, preserving:
 *   • each user's customizations (chapters / questions where
 *     `is_custom: true`)
 *   • the per-question is_active flag the user toggled in
 *     /book/[id]/customize
 *
 * Why: structure was snapshotted into user_books at start time. The
 * old memoir-ko template was Korean-only on most prompts, so an
 * existing book read in EN/ES showed mixed Korean. After re-seeding
 * memoir-ko fully tri-lingual, this script propagates the new
 * translations into already-running books WITHOUT touching the
 * user_book_responses rows (those are keyed by question_id strings
 * which stay stable across refreshes).
 *
 * Usage:
 *   DATABASE_URL=$LOCAL_DATABASE_URL node scripts/refresh-book-structures.js
 *   DATABASE_URL=$PROD_DATABASE_URL  node scripts/refresh-book-structures.js
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  const books = await sql`
    SELECT b.id, b.user_id, b.template_id, b.structure,
           t.default_structure
      FROM user_books b
      JOIN book_template_definitions t ON t.id = b.template_id
  `;
  console.log(`▶ refreshing ${books.length} books…`);

  let updated = 0;
  for (const row of books) {
    const tmpl = row.default_structure || { chapters: [] };
    const cur  = row.structure          || { chapters: [] };

    // Build a quick lookup of the user's existing chapters so we can
    // carry over flags + custom additions.
    const curChById = Object.create(null);
    for (const ch of (cur.chapters || [])) curChById[ch.id] = ch;

    const refreshed = {
      ...tmpl,
      chapters: [
        // Template chapters: pick fresh prompts/titles, keep the
        // user's per-row toggles (is_active / is_custom flags).
        ...(tmpl.chapters || []).map(tch => {
          const userCh = curChById[tch.id] || {};
          const userQById = Object.create(null);
          for (const q of (userCh.questions || [])) userQById[q.id] = q;
          return {
            ...tch,
            is_active: userCh.is_active !== false,
            is_custom: userCh.is_custom || false,
            questions: (tch.questions || []).map(tq => {
              const userQ = userQById[tq.id] || {};
              return {
                ...tq,
                is_active: userQ.is_active !== false,
                is_custom: userQ.is_custom || false,
              };
            }).concat(
              // User-added custom questions in this chapter survive.
              (userCh.questions || [])
                .filter(q => q.is_custom && !((tch.questions || []).some(tq => tq.id === q.id)))
            ),
          };
        }),
        // User-added custom chapters survive.
        ...((cur.chapters || []).filter(ch => ch.is_custom && !(tmpl.chapters || []).some(tch => tch.id === ch.id))),
      ],
    };

    await sql`
      UPDATE user_books
         SET structure = ${JSON.stringify(refreshed)}::jsonb,
             updated_at = NOW()
       WHERE id = ${row.id}
    `;
    updated++;
  }
  console.log(`✅ refreshed ${updated} books`);
})().catch(e => { console.error(e); process.exit(1); });
