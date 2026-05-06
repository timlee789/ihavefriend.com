#!/usr/bin/env node
/**
 * scripts/apply-fragment-audios-migration.js
 *
 * Applies prisma/migrations/20260505_1_fragment_audios/migration.sql
 * via @neondatabase/serverless's Pool (websocket-based, supports raw
 * multi-statement queries). We don't go through `prisma migrate deploy`
 * because Prisma still chokes on the Neon pooler hostname (P1001).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-fragment-audios-migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const MIGRATION_NAME = '20260505_1_fragment_audios';
const SQL_PATH = path.join(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql');

(async () => {
  const text = fs.readFileSync(SQL_PATH, 'utf8');
  const pool = new Pool({ connectionString: URL });
  const client = await pool.connect();
  try {
    console.log(`📜 Applying ${MIGRATION_NAME} (${text.length} chars)`);
    await client.query(text);
    console.log('✅ statements applied');

    const exists = await client.query(
      `SELECT 1 FROM _prisma_migrations WHERE migration_name = $1`,
      [MIGRATION_NAME]
    );
    if (exists.rows.length === 0) {
      await client.query(
        `INSERT INTO _prisma_migrations
           (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (gen_random_uuid()::text, 'manual-voice-qr-step02', NOW(), $1, NULL, NULL, NOW(), 1)`,
        [MIGRATION_NAME]
      );
      console.log('📝 recorded in _prisma_migrations');
    } else {
      console.log('📝 already recorded in _prisma_migrations');
    }

    // Verify table + indexes + trigger exist
    const t = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name = 'fragment_audios'`
    );
    console.log('✅ table present:', t.rows.map(r => r.table_name));

    const idx = await client.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'fragment_audios'
        ORDER BY indexname`
    );
    console.log('✅ indexes:', idx.rows.map(r => r.indexname));

    const trg = await client.query(
      `SELECT tgname FROM pg_trigger
        WHERE tgrelid = 'fragment_audios'::regclass
          AND NOT tgisinternal`
    );
    console.log('✅ triggers:', trg.rows.map(r => r.tgname));
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
