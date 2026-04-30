#!/usr/bin/env node
/**
 * scripts/apply-book-dedup-index.js  (Task 71)
 *
 * Two steps, idempotent:
 *
 * 1. Cleanup — for each (user_id, template_id) tuple with more than
 *    one in_progress book, keep the OLDEST (first created) and mark
 *    the rest status='abandoned'. This preserves the user's earliest
 *    answers (which the resume flow will pick up) and quietly retires
 *    the duplicates.
 *
 * 2. Index — create a partial UNIQUE index on
 *    user_books (user_id, template_id) WHERE status = 'in_progress'.
 *    From here on, /api/book/start can't accidentally create a second
 *    in-progress book for the same template; the existing resume path
 *    already returns the existing one.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-book-dedup-index.js
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  // 1. Find duplicates and abandon all but the oldest.
  console.log('▶ scanning for duplicate in-progress books…');
  const dupes = await sql`
    SELECT user_id, template_id,
           COUNT(*)::int                    AS cnt,
           array_agg(id ORDER BY started_at) AS ids
      FROM user_books
     WHERE status = 'in_progress'
     GROUP BY user_id, template_id
    HAVING COUNT(*) > 1
  `;

  let abandoned = 0;
  for (const d of dupes) {
    const [keepId, ...abandonIds] = d.ids;
    console.log(
      `  · user=${d.user_id} template=${d.template_id} keeping=${keepId} abandoning=${abandonIds.length}`
    );
    if (abandonIds.length > 0) {
      await sql`
        UPDATE user_books
           SET status = 'abandoned'
         WHERE id = ANY(${abandonIds}::uuid[])
      `;
      abandoned += abandonIds.length;
    }
  }
  console.log(`  → abandoned ${abandoned} duplicate row(s) across ${dupes.length} group(s)`);

  // 2. Partial unique index — from now on, the DB itself blocks
  //    accidental double-starts.
  console.log('▶ creating partial unique index…');
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_books_one_in_progress
      ON user_books (user_id, template_id)
      WHERE status = 'in_progress'
  `;

  console.log('✅ dedup index applied');
})().catch(e => { console.error(e); process.exit(1); });
