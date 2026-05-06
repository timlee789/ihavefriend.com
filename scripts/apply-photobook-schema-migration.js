#!/usr/bin/env node
/**
 * scripts/apply-photobook-schema-migration.js
 *
 * Applies prisma/migrations/20260506_2_photobook_schema/migration.sql via
 * @neondatabase/serverless's Pool. Pattern matches earlier apply scripts.
 *
 * Photobook v3 Phase 1 (P1):
 *   - user_books.book_type column
 *   - photobook_pages table (no layout_template — single layout)
 *   - photobook_page_photos table (UNIQUE page_id — 1 photo per page)
 *   - photobook_page_audios table (UNIQUE page_id — 1 audio per page)
 *   - updated_at triggers
 *
 * Strategy doc: STRATEGY-photobook-expansion-v3-2026-05-06.md
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-photobook-schema-migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const MIGRATION_NAME = '20260506_2_photobook_schema';
const SQL_PATH = path.join(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql');

(async () => {
  const text = fs.readFileSync(SQL_PATH, 'utf8');
  const pool = new Pool({ connectionString: URL });
  const client = await pool.connect();
  try {
    console.log(`📜 Applying ${MIGRATION_NAME} (${text.length} chars)`);

    // Snapshot BEFORE state
    const beforeBookCol = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'user_books' AND column_name = 'book_type'`
    );
    console.log(`🔎 BEFORE user_books.book_type column: ${beforeBookCol.rows.length > 0 ? 'EXISTS' : 'missing'}`);

    const beforeTables = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'photobook%'
        ORDER BY table_name`
    );
    console.log('🔎 BEFORE photobook tables:', beforeTables.rows.map(r => r.table_name));

    // Apply migration
    await client.query(text);
    console.log('✅ statements applied');

    // Record in _prisma_migrations
    const exists = await client.query(
      `SELECT 1 FROM _prisma_migrations WHERE migration_name = $1`,
      [MIGRATION_NAME]
    );
    if (exists.rows.length === 0) {
      await client.query(
        `INSERT INTO _prisma_migrations
           (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (gen_random_uuid()::text, 'manual-photobook-v3-p1', NOW(), $1, NULL, NULL, NOW(), 1)`,
        [MIGRATION_NAME]
      );
      console.log('📝 recorded in _prisma_migrations');
    } else {
      console.log('📝 already recorded in _prisma_migrations');
    }

    // ─── Verify AFTER state ───

    // 1. user_books.book_type
    const afterBookCol = await client.query(
      `SELECT column_name, data_type, column_default, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'user_books' AND column_name = 'book_type'`
    );
    console.log('✅ user_books.book_type column:', afterBookCol.rows[0]);

    // 2. New tables
    const afterTables = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'photobook%'
        ORDER BY table_name`
    );
    console.log('✅ AFTER photobook tables:', afterTables.rows.map(r => r.table_name));

    const expected = ['photobook_page_audios', 'photobook_page_photos', 'photobook_pages'];
    const got      = afterTables.rows.map(r => r.table_name).sort();
    const allPresent = expected.every(t => got.includes(t));
    if (allPresent) {
      console.log('✅ All 3 photobook tables created');
    } else {
      const missing = expected.filter(t => !got.includes(t));
      console.warn('⚠️  Missing tables:', missing);
    }

    // 3. UNIQUE constraints
    const constraints = await client.query(
      `SELECT conname, conrelid::regclass::text AS table_name
         FROM pg_constraint
        WHERE conrelid::regclass::text LIKE 'photobook%'
          AND contype = 'u'
        ORDER BY table_name, conname`
    );
    console.log('✅ Photobook UNIQUE constraints:');
    constraints.rows.forEach(r => console.log(`     ${r.table_name}: ${r.conname}`));

    // 4. Indexes
    const idx = await client.query(
      `SELECT indexname, tablename FROM pg_indexes
        WHERE tablename LIKE 'photobook%'
          OR (tablename = 'user_books' AND indexname = 'idx_user_books_user_type')
        ORDER BY tablename, indexname`
    );
    console.log('✅ Photobook indexes:');
    idx.rows.forEach(r => console.log(`     ${r.tablename}: ${r.indexname}`));

    // 5. Triggers
    const triggers = await client.query(
      `SELECT trigger_name, event_object_table
         FROM information_schema.triggers
        WHERE event_object_table LIKE 'photobook%'
        ORDER BY event_object_table, trigger_name`
    );
    console.log('✅ Photobook triggers:');
    triggers.rows.forEach(r => console.log(`     ${r.event_object_table}: ${r.trigger_name}`));

    // 6. Sanity row count (should be 0 since fresh tables)
    const counts = await Promise.all(
      expected.map(t => client.query(`SELECT COUNT(*)::int AS cnt FROM ${t}`).then(r => `${t}: ${r.rows[0].cnt}`))
    );
    console.log('✅ Row counts:', counts);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('❌', e.message); console.error(e.stack); process.exit(1); });
