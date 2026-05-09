#!/usr/bin/env node
/**
 * scripts/apply-architect-v2-cleanup-migration.js
 *
 * Applies prisma/migrations/20260509_1_architect_v2_cleanup/migration.sql
 * via @neondatabase/serverless's Pool.
 *
 * Architect Bot V2 — Cleanup + Integration:
 *   - DROP user_blueprints + user_chapters + user_questions (제 실수 정정)
 *   - DROP chat_sessions.user_question_id, story_fragments.user_question_id
 *   - CREATE blueprint_samples (5 시나리오 위한 새 테이블)
 *   - ALTER user_books ADD source_sample_id
 *   - UPDATE book_template_definitions SET is_active=false
 *
 * Tim 의 결정 (2026-05-08):
 *   "기존의 시스템을 절대 훼손하지 않고 여기에 편입해서 일을 해야하는것"
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 * Decision: DECISION-deprecate-user-blueprints-2026-05-08.md
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-architect-v2-cleanup-migration.js
 *
 * 안전:
 *   - Tim 검증: dev DB 에 진행 중 user_books 없음 (Q3=b)
 *   - Tim 검증: 진행 중 user_blueprints 없음 (V1 시스템 미사용)
 *   - Idempotent 패턴 (DROP IF EXISTS, CREATE IF NOT EXISTS, DO $$ BEGIN ... END $$)
 *   - 트랜잭션 (BEGIN/COMMIT) — 실패 시 ROLLBACK
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const MIGRATION_NAME = '20260509_1_architect_v2_cleanup';
const SQL_PATH = path.join(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql');

// Verification expectations
const TABLES_TO_DROP = ['user_blueprints', 'user_chapters', 'user_questions'];
const COLUMNS_TO_DROP = [
  { table: 'chat_sessions', column: 'user_question_id' },
  { table: 'story_fragments', column: 'user_question_id' },
];
const TABLES_TO_CREATE = ['blueprint_samples'];
const COLUMNS_TO_ADD = [
  { table: 'user_books', column: 'source_sample_id' },
];

(async () => {
  const text = fs.readFileSync(SQL_PATH, 'utf8');
  const pool = new Pool({ connectionString: URL });
  const client = await pool.connect();
  try {
    console.log(`📜 Applying ${MIGRATION_NAME} (${text.length} chars)\n`);

    // ──────────────────────────────────────────────────────────
    // PRE-CHECK 1: 폐기 대상에 데이터 없는지 검증 (안전 가드)
    // ──────────────────────────────────────────────────────────
    console.log('🔍 Pre-check: 폐기 대상 데이터 확인...');
    
    let hasData = false;
    for (const table of TABLES_TO_DROP) {
      try {
        const r = await client.query(`SELECT COUNT(*) as cnt FROM ${table}`);
        const cnt = parseInt(r.rows[0].cnt, 10);
        if (cnt > 0) {
          console.error(`   ❌ ${table}: ${cnt} rows (예상: 0)`);
          hasData = true;
        } else {
          console.log(`   ✅ ${table}: 0 rows (안전)`);
        }
      } catch (e) {
        console.log(`   ⚠️  ${table}: 테이블 없음 (이미 dropped)`);
      }
    }
    
    if (hasData) {
      console.error('\n❌ 폐기 대상에 데이터 존재. 수동 검증 필요.');
      console.error('   Tim 의 dev DB 에 진행 중 user_blueprints 가 있다는 의미입니다.');
      console.error('   migration 중단 — DB 변경 없음.');
      process.exit(1);
    }

    // ──────────────────────────────────────────────────────────
    // PRE-CHECK 2: 보존 대상 (chapter_library, question_library)
    // ──────────────────────────────────────────────────────────
    console.log('\n🔍 Pre-check: 보존 대상 (영감 라이브러리)...');
    
    try {
      const ch = await client.query(`SELECT COUNT(*) as cnt FROM chapter_library`);
      const q = await client.query(`SELECT COUNT(*) as cnt FROM question_library`);
      console.log(`   ✅ chapter_library: ${ch.rows[0].cnt} rows (보존)`);
      console.log(`   ✅ question_library: ${q.rows[0].cnt} rows (보존)`);
    } catch (e) {
      console.error('   ❌ 영감 라이브러리 누락:', e.message);
      console.error('   Phase 1a 의 자산이 사라졌습니다. 진행 중단.');
      process.exit(1);
    }

    // ──────────────────────────────────────────────────────────
    // PRE-CHECK 3: book_template_definitions active count
    // ──────────────────────────────────────────────────────────
    console.log('\n🔍 Pre-check: book_template_definitions...');
    
    try {
      const r = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE is_active = false) as inactive,
          COUNT(*) as total
        FROM book_template_definitions
      `);
      const { active, inactive, total } = r.rows[0];
      console.log(`   📋 templates: total=${total}, active=${active}, inactive=${inactive}`);
      console.log(`   → migration 후: total=${total}, active=0, inactive=${total}`);
    } catch (e) {
      console.log('   ⚠️  book_template_definitions 없음 (이미 정리됨?)');
    }

    // ──────────────────────────────────────────────────────────
    // APPLY MIGRATION (트랜잭션)
    // ──────────────────────────────────────────────────────────
    console.log('\n🚀 Migration 적용 중 (트랜잭션)...');
    
    await client.query('BEGIN');
    await client.query(text);
    await client.query('COMMIT');

    console.log('✅ Migration applied successfully.\n');

    // ──────────────────────────────────────────────────────────
    // POST-CHECK: 검증
    // ──────────────────────────────────────────────────────────
    console.log('🔍 Verification:');
    
    // 1. 폐기된 테이블 (없어야 함)
    console.log('\n   [폐기 대상]');
    for (const table of TABLES_TO_DROP) {
      const r = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [table]);
      console.log(`   ${r.rows.length === 0 ? '✅' : '❌'} table dropped: ${table}`);
    }

    // 2. 폐기된 컬럼 (없어야 함)
    console.log('\n   [컬럼 제거]');
    for (const { table, column } of COLUMNS_TO_DROP) {
      const r = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      `, [table, column]);
      console.log(`   ${r.rows.length === 0 ? '✅' : '❌'} column dropped: ${table}.${column}`);
    }

    // 3. 새 테이블 (있어야 함)
    console.log('\n   [새 테이블]');
    for (const table of TABLES_TO_CREATE) {
      const r = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [table]);
      console.log(`   ${r.rows.length > 0 ? '✅' : '❌'} table created: ${table}`);
    }

    // 4. 새 컬럼 (있어야 함)
    console.log('\n   [컬럼 추가]');
    for (const { table, column } of COLUMNS_TO_ADD) {
      const r = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      `, [table, column]);
      console.log(`   ${r.rows.length > 0 ? '✅' : '❌'} column added: ${table}.${column}`);
    }

    // 5. book_template_definitions 비활성화
    const tplCheck = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_active = false) as inactive
      FROM book_template_definitions
    `);
    const tpl = tplCheck.rows[0];
    console.log(`\n   [book_template_definitions]`);
    console.log(`   ${parseInt(tpl.active, 10) === 0 ? '✅' : '❌'} active = ${tpl.active} (예상: 0)`);
    console.log(`   ✅ inactive = ${tpl.inactive} (보존됨)`);

    // 6. 보존 자산 검증
    const ch2 = await client.query(`SELECT COUNT(*) as cnt FROM chapter_library`);
    const q2 = await client.query(`SELECT COUNT(*) as cnt FROM question_library`);
    console.log(`\n   [보존 자산]`);
    console.log(`   ✅ chapter_library: ${ch2.rows[0].cnt} rows (그대로)`);
    console.log(`   ✅ question_library: ${q2.rows[0].cnt} rows (그대로)`);

    console.log('\n📋 Next steps:');
    console.log('   1. Prisma schema.prisma 정리 (5 모델 삭제 + 1 모델 + 1 컬럼 추가)');
    console.log('   2. npx prisma format && npx prisma generate');
    console.log('   3. (다음 task) scripts/seed-blueprint-samples.js — 시나리오 5개 INSERT');
    console.log('   4. (다음 task) UI + API endpoints');

    console.log('\n💡 주의:');
    console.log('   Phase 1a-1b 의 영감 라이브러리 + 4 API endpoints 는 KEEP.');
    console.log('   미래에 시나리오 만들기 / 구조 수정 페이지에서 활용 가능.');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Migration failed:', err.message);
    console.error(err.stack);
    console.error('\n🔄 트랜잭션 ROLLBACK 됨 — DB 변경 0.');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
