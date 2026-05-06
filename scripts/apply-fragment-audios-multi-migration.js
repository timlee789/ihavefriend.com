#!/usr/bin/env node
/**
 * scripts/apply-fragment-audios-multi-migration.js
 *
 * Applies prisma/migrations/20260506_1_fragment_audios_multi/migration.sql
 * via @neondatabase/serverless's Pool. Pattern matches the earlier
 * apply-fragment-audios-migration.js (we don't go through `prisma migrate
 * deploy` because Prisma still chokes on the Neon pooler hostname P1001).
 *
 * Step 11 (Voice QR Phase 1):
 *   - drop UNIQUE(fragment_id), add audio_order column,
 *     add UNIQUE(fragment_id, audio_order)
 *   - allows multiple audio recordings per fragment (continuation flow)
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-fragment-audios-multi-migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const MIGRATION_NAME = '20260506_1_fragment_audios_multi';
const SQL_PATH = path.join(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql');

(async () => {
  const text = fs.readFileSync(SQL_PATH, 'utf8');
  const pool = new Pool({ connectionString: URL });
  const client = await pool.connect();
  try {
    console.log(`📜 Applying ${MIGRATION_NAME} (${text.length} chars)`);

    // Snapshot current schema state for verification
    const before = await client.query(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'fragment_audios'::regclass
        ORDER BY conname`
    );
    console.log('🔎 BEFORE constraints:', before.rows.map(r => r.conname));

    const beforeCols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'fragment_audios'
        ORDER BY ordinal_position`
    );
    const hasAudioOrder = beforeCols.rows.some(r => r.column_name === 'audio_order');
    console.log(`🔎 BEFORE has audio_order column: ${hasAudioOrder}`);

    // Apply migration
    await client.query(text);
    console.log('✅ statements applied');

    // Record in _prisma_migrations table
    const exists = await client.query(
      `SELECT 1 FROM _prisma_migrations WHERE migration_name = $1`,
      [MIGRATION_NAME]
    );
    if (exists.rows.length === 0) {
      await client.query(
        `INSERT INTO _prisma_migrations
           (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (gen_random_uuid()::text, 'manual-voice-qr-step11', NOW(), $1, NULL, NULL, NOW(), 1)`,
        [MIGRATION_NAME]
      );
      console.log('📝 recorded in _prisma_migrations');
    } else {
      console.log('📝 already recorded in _prisma_migrations');
    }

    // Verify post-migration state
    const after = await client.query(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'fragment_audios'::regclass
        ORDER BY conname`
    );
    console.log('✅ AFTER constraints:', after.rows.map(r => r.conname));

    const afterCols = await client.query(
      `SELECT column_name, data_type, column_default
         FROM information_schema.columns
        WHERE table_name = 'fragment_audios'
        ORDER BY ordinal_position`
    );
    const audioOrderCol = afterCols.rows.find(r => r.column_name === 'audio_order');
    console.log('✅ audio_order column:', audioOrderCol);

    const idx = await client.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'fragment_audios'
        ORDER BY indexname`
    );
    console.log('✅ indexes:', idx.rows.map(r => r.indexname));

    // Sanity: ensure existing rows got audio_order = 1
    const orderStats = await client.query(
      `SELECT audio_order, COUNT(*) AS cnt
         FROM fragment_audios
        GROUP BY audio_order
        ORDER BY audio_order`
    );
    console.log('✅ audio_order distribution:', orderStats.rows);

    // Verify the OLD unique constraint is gone
    const oldUniqueGone = !after.rows.some(
      r => r.conname === 'fragment_audios_one_per_fragment' ||
           r.conname === 'fragment_audios_fragment_id_key'
    );
    if (oldUniqueGone) {
      console.log('✅ Old single-audio UNIQUE constraint removed');
    } else {
      console.warn('⚠️  Old UNIQUE constraint still present — migration may have failed');
    }

    // Verify the NEW composite unique exists
    const newUniqueExists = after.rows.some(
      r => r.conname === 'fragment_audios_fragment_order_unique'
    );
    if (newUniqueExists) {
      console.log('✅ New (fragment_id, audio_order) UNIQUE constraint present');
    } else {
      console.warn('⚠️  New composite UNIQUE constraint missing');
    }

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
