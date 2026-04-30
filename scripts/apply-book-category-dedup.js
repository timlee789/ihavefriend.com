#!/usr/bin/env node
/**
 * scripts/apply-book-category-dedup.js  (Task 73)
 *
 * Migrates the dedup constraint from (user_id, template_id) to
 * (user_id, template_category). The previous unique index (Task 71)
 * treated memoir-ko / memoir-en / memoir-es as three different
 * templates, so a senior who toggled languages ended up with three
 * "내 자서전" rows in flight. Category is the real deduplication
 * unit: one memoir + one essay collection per user, max.
 *
 * Steps (idempotent):
 *   1. Add user_books.template_category (denormalized from
 *      book_template_definitions.category).
 *   2. Backfill existing rows via the template JOIN.
 *   3. Resolve duplicate (user_id, category) groups — keep the
 *      OLDEST in_progress book, mark the rest status='abandoned'.
 *   4. Drop the old (user_id, template_id) unique index, create
 *      the new (user_id, template_category) one.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-book-category-dedup.js
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  // 1. Column.
  console.log('▶ adding user_books.template_category…');
  await sql`ALTER TABLE user_books ADD COLUMN IF NOT EXISTS template_category TEXT`;

  // 2. Backfill from template join (only for rows that don't have it yet).
  console.log('▶ backfilling category from book_template_definitions…');
  await sql`
    UPDATE user_books b
       SET template_category = t.category
      FROM book_template_definitions t
     WHERE b.template_id = t.id
       AND (b.template_category IS NULL OR b.template_category = '')
  `;

  // 3. Resolve duplicate (user_id, category) in_progress groups.
  console.log('▶ resolving duplicate in_progress books per category…');
  const dupes = await sql`
    SELECT user_id, template_category,
           COUNT(*)::int                     AS cnt,
           array_agg(id ORDER BY started_at) AS ids
      FROM user_books
     WHERE status = 'in_progress' AND template_category IS NOT NULL
     GROUP BY user_id, template_category
    HAVING COUNT(*) > 1
  `;

  let abandoned = 0;
  for (const d of dupes) {
    const [keep, ...rest] = d.ids;
    console.log(
      `  · user=${d.user_id} category=${d.template_category} keep=${keep} abandon=${rest.length}`
    );
    if (rest.length > 0) {
      await sql`
        UPDATE user_books
           SET status = 'abandoned'
         WHERE id = ANY(${rest}::uuid[])
      `;
      abandoned += rest.length;
    }
  }
  console.log(`  → abandoned ${abandoned} duplicate row(s) across ${dupes.length} group(s)`);

  // 4. Swap the unique index.
  console.log('▶ swapping unique index to (user_id, template_category)…');
  await sql`DROP INDEX IF EXISTS idx_user_books_one_in_progress`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_books_one_per_category
      ON user_books (user_id, template_category)
      WHERE status = 'in_progress'
  `;

  // Sanity dump.
  const after = await sql`
    SELECT user_id, template_id, template_category, status
      FROM user_books
     ORDER BY user_id, started_at
     LIMIT 50
  `;
  console.table(after);
  console.log('✅ category-level dedup applied');
})().catch(e => { console.error(e); process.exit(1); });
