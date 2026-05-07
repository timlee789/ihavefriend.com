#!/usr/bin/env node
/**
 * scripts/apply-photobook-original-photos-migration.js
 *
 * Applies prisma/migrations/20260506_3_photobook_original_photos/migration.sql
 * — Photobook v3 R0 (original-photo storage). Pattern matches earlier
 * apply-* scripts.
 *
 * Adds 6 NULLable columns to photobook_page_photos:
 *   - r2_key_original, r2_url_original
 *   - original_width, original_height
 *   - original_size_bytes, original_mime_type
 *
 * Strategy: STRATEGY-photobook-r0-original-photo-storage-2026-05-06.md
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-photobook-original-photos-migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const MIGRATION_NAME = '20260506_3_photobook_original_photos';
const SQL_PATH = path.join(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql');

const NEW_COLUMNS = [
  'r2_key_original',
  'r2_url_original',
  'original_width',
  'original_height',
  'original_size_bytes',
  'original_mime_type',
];

(async () => {
  const text = fs.readFileSync(SQL_PATH, 'utf8');
  const pool = new Pool({ connectionString: URL });
  const client = await pool.connect();
  try {
    console.log(`📜 Applying ${MIGRATION_NAME} (${text.length} chars)`);

    // ─── Snapshot BEFORE ───
    const beforeCols = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'photobook_page_photos'
          AND column_name = ANY($1::text[])
        ORDER BY column_name`,
      [NEW_COLUMNS]
    );
    console.log(`🔎 BEFORE — new columns present: ${beforeCols.rows.length} / ${NEW_COLUMNS.length}`);
    beforeCols.rows.forEach(r => console.log(`     ${r.column_name}`));

    // ─── Apply ───
    await client.query(text);
    console.log('✅ statements applied');

    // ─── Record in _prisma_migrations ───
    const exists = await client.query(
      `SELECT 1 FROM _prisma_migrations WHERE migration_name = $1`,
      [MIGRATION_NAME]
    );
    if (exists.rows.length === 0) {
      await client.query(
        `INSERT INTO _prisma_migrations
           (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (gen_random_uuid()::text, 'manual-photobook-v3-r0', NOW(), $1, NULL, NULL, NOW(), 1)`,
        [MIGRATION_NAME]
      );
      console.log('📝 recorded in _prisma_migrations');
    } else {
      console.log('📝 already recorded in _prisma_migrations');
    }

    // ─── Verify AFTER ───
    const afterCols = await client.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'photobook_page_photos'
          AND column_name = ANY($1::text[])
        ORDER BY column_name`,
      [NEW_COLUMNS]
    );
    console.log(`✅ AFTER — new columns present: ${afterCols.rows.length} / ${NEW_COLUMNS.length}`);
    afterCols.rows.forEach(r =>
      console.log(`     ${r.column_name} (${r.data_type}, nullable=${r.is_nullable})`)
    );

    const got = afterCols.rows.map(r => r.column_name).sort();
    const missing = NEW_COLUMNS.filter(c => !got.includes(c));
    if (missing.length > 0) {
      console.warn('⚠️  Missing columns:', missing);
      process.exit(1);
    }
    if (afterCols.rows.some(r => r.is_nullable !== 'YES')) {
      console.warn('⚠️  Some new columns are NOT nullable (must all be YES for legacy rows)');
      process.exit(1);
    }
    console.log('✅ All 6 R0 columns are NULLable as expected');

    // ─── Spot-check existing rows: new columns should be NULL ───
    const sample = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(r2_key_original)::int AS with_original
         FROM photobook_page_photos`
    );
    const { total, with_original } = sample.rows[0];
    console.log(`✅ photobook_page_photos: total=${total}, with_original=${with_original} (legacy rows have NULL — expected)`);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('❌', e.message); console.error(e.stack); process.exit(1); });
