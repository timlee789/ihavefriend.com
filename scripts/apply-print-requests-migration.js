#!/usr/bin/env node
/**
 * scripts/apply-print-requests-migration.js
 *
 * Applies prisma/migrations/20260507_1_print_requests/migration.sql
 * via @neondatabase/serverless's Pool. Pattern matches earlier
 * apply-* scripts.
 *
 * Adds the print_requests table that backs R2 (인쇄 신청 + Tim 이메일
 * 검수). 6-stage status, vendor/cost tracking, email notification flag.
 *
 * Strategy: STRATEGY-photobook-r2-print-request-2026-05-07.md §2.1
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-print-requests-migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const MIGRATION_NAME = '20260507_1_print_requests';
const SQL_PATH = path.join(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql');

const EXPECTED_COLUMNS = [
  'id', 'user_id', 'user_book_id',
  'recipient_name', 'recipient_phone',
  'shipping_address', 'shipping_city', 'shipping_state',
  'shipping_postal', 'shipping_country',
  'message_to_recipient',
  'status',
  'vendor', 'vendor_order_id', 'cost_usd', 'tim_notes',
  'pdf_size_bytes', 'page_count',
  'email_sent_to_tim', 'email_sent_at',
  'created_at', 'updated_at',
];

(async () => {
  const text = fs.readFileSync(SQL_PATH, 'utf8');
  const pool = new Pool({ connectionString: URL });
  const client = await pool.connect();
  try {
    console.log(`📜 Applying ${MIGRATION_NAME} (${text.length} chars)`);

    const beforeTable = await client.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'print_requests'`
    );
    console.log(`🔎 BEFORE — print_requests table: ${beforeTable.rows.length > 0 ? 'EXISTS' : 'missing'}`);

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
         VALUES (gen_random_uuid()::text, 'manual-photobook-v3-r2', NOW(), $1, NULL, NULL, NOW(), 1)`,
        [MIGRATION_NAME]
      );
      console.log('📝 recorded in _prisma_migrations');
    } else {
      console.log('📝 already recorded in _prisma_migrations');
    }

    // ─── Verify AFTER ───
    const cols = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'print_requests'
        ORDER BY ordinal_position`
    );
    console.log(`✅ AFTER — print_requests columns: ${cols.rows.length}`);
    const got = cols.rows.map(r => r.column_name);
    const missing = EXPECTED_COLUMNS.filter(c => !got.includes(c));
    if (missing.length > 0) {
      console.warn('⚠️  Missing columns:', missing);
      process.exit(1);
    }
    console.log(`✅ All ${EXPECTED_COLUMNS.length} expected columns present`);

    const idx = await client.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'print_requests'
        ORDER BY indexname`
    );
    console.log('✅ Indexes:');
    idx.rows.forEach(r => console.log(`     ${r.indexname}`));

    const trg = await client.query(
      `SELECT trigger_name FROM information_schema.triggers
        WHERE event_object_table = 'print_requests'`
    );
    console.log('✅ Triggers:');
    trg.rows.forEach(r => console.log(`     ${r.trigger_name}`));

    const cnt = await client.query(`SELECT COUNT(*)::int AS cnt FROM print_requests`);
    console.log(`✅ Row count: ${cnt.rows[0].cnt}`);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('❌', e.message); console.error(e.stack); process.exit(1); });
