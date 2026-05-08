#!/usr/bin/env node
/**
 * scripts/apply-architect-system-migration.js
 *
 * Applies prisma/migrations/20260508_1_architect_system/migration.sql
 * via @neondatabase/serverless's Pool. Pattern matches earlier apply-* scripts.
 *
 * Architect Bot system schema:
 *   - chapter_library + question_library (Tim 큐레이션, 영감 트리거)
 *   - user_blueprints + user_chapters + user_questions (사용자 청사진)
 *   - chat_sessions + story_fragments 확장 (user_question_id)
 *
 * Strategy: STRATEGY-architect-bot-final-2026-05-07.md
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-architect-system-migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const MIGRATION_NAME = '20260508_1_architect_system';
const SQL_PATH = path.join(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql');

const EXPECTED_TABLES = [
  'chapter_library',
  'question_library',
  'user_blueprints',
  'user_chapters',
  'user_questions',
];

const EXPECTED_NEW_COLUMNS = [
  { table: 'chat_sessions', column: 'user_question_id' },
  { table: 'story_fragments', column: 'user_question_id' },
];

(async () => {
  const text = fs.readFileSync(SQL_PATH, 'utf8');
  const pool = new Pool({ connectionString: URL });
  const client = await pool.connect();
  try {
    console.log(`📜 Applying ${MIGRATION_NAME} (${text.length} chars)`);

    // Pre-check: 테이블 존재 여부
    const beforeTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `, [EXPECTED_TABLES]);

    if (beforeTables.rows.length > 0) {
      console.log(`⚠️  Some tables already exist: ${beforeTables.rows.map(r => r.table_name).join(', ')}`);
      console.log('   Migration is idempotent (CREATE TABLE IF NOT EXISTS) — proceeding.');
    }

    // Apply migration (single transaction)
    await client.query('BEGIN');
    await client.query(text);
    await client.query('COMMIT');

    console.log('✅ Migration applied successfully.');

    // Post-check: 테이블 + 컬럼 검증
    console.log('\n🔍 Verification:');

    for (const table of EXPECTED_TABLES) {
      const r = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [table]);
      console.log(`   ${r.rows.length > 0 ? '✅' : '❌'} table: ${table}`);
    }

    for (const { table, column } of EXPECTED_NEW_COLUMNS) {
      const r = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      `, [table, column]);
      console.log(`   ${r.rows.length > 0 ? '✅' : '❌'} ${table}.${column}`);
    }

    // GIN index 검증
    const ginIndexes = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('idx_chapter_library_tags', 'idx_question_library_tags')
    `);
    console.log(`   ✅ GIN indexes: ${ginIndexes.rows.length}/2`);

    console.log('\n📋 Next steps:');
    console.log('   1. node scripts/seed-architect-libraries.js   (라이브러리 데이터 INSERT)');
    console.log('   2. Prisma schema.prisma 에 모델 추가 (별도 task)');
    console.log('   3. /api/architect/* endpoints 구현');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
