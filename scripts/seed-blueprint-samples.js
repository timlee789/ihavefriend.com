#!/usr/bin/env node
/**
 * scripts/seed-blueprint-samples.js
 *
 * Seeds the `blueprint_samples` table with Tim's curated 5 시나리오
 * from data/architect/sample-blueprints-ko.json.
 *
 * 시나리오 (Tim 큐레이션, 2026-05-09):
 *   - sample-001: 한국 시골 → 미국 이민 (8 챕터)
 *   - sample-002: 도시 출신 + 신앙 중심 (8 챕터)
 *   - sample-003: 사업가의 도전과 회복 (9 챕터)
 *   - sample-004: 평범한 직장인 + 가정 중심 (7 챕터)
 *   - sample-005: 이민 1.5세대 + 두 문화 (8 챕터)
 *
 * 각 sample.structure 는 book_template_definitions.default_structure 와
 * 동일 형식 — POST /api/book/start 가 sampleId 받으면 이 structure 를
 * user_books.structure 로 복사함.
 *
 * Idempotent: ON CONFLICT (id) DO UPDATE — JSON 파일 수정 후 재실행 시
 * 변경된 내용만 DB 업데이트. Tim 의 admin UI 만들기 전까지 이 패턴 사용.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/seed-blueprint-samples.js
 *
 * Optional flags:
 *   --dry-run          INSERT 안 하고 검증만
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const DRY_RUN = process.argv.includes('--dry-run');
const DATA_PATH = path.join(__dirname, '..', 'data', 'architect', 'sample-blueprints-ko.json');

(async () => {
  console.log('🌱 SayAndKeep Blueprint Samples Seeder');
  console.log(`   Data: ${DATA_PATH}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

  // Load JSON
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`❌ Data file not found: ${DATA_PATH}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const samples = data.samples || [];

  console.log(`📚 Loaded ${samples.length} samples from JSON`);

  // Validate each sample
  let validationFailed = false;
  for (const s of samples) {
    if (!s.id || !s.display_label || !s.structure) {
      console.error(`   ❌ Invalid sample: ${s.id || '(no id)'}`);
      validationFailed = true;
      continue;
    }
    if (!s.structure.chapters || !Array.isArray(s.structure.chapters)) {
      console.error(`   ❌ ${s.id}: chapters[] missing or invalid`);
      validationFailed = true;
      continue;
    }
    const chCount = s.structure.chapters.length;
    const qCount = s.structure.chapters.reduce(
      (sum, ch) => sum + (ch.questions?.length || 0), 0
    );
    console.log(`   ✅ ${s.id} (${s.display_label}): ${chCount} chapters, ${qCount} questions`);
  }

  if (validationFailed) {
    console.error('\n❌ Validation failed. Fix JSON and retry.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] No DB changes.');
    return;
  }

  // INSERT (idempotent)
  const pool = new Pool({ connectionString: URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let inserted = 0;
    for (const s of samples) {
      // _persona_note 와 _meta 는 운영 노트, structure 에서 제거하고 저장 X
      // (블루프린트 샘플 자체에는 persona note 가 의미 있음 — 보존)
      
      await client.query(`
        INSERT INTO blueprint_samples (
          id, display_label, language, structure, is_active, sort_order,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          display_label = EXCLUDED.display_label,
          language      = EXCLUDED.language,
          structure     = EXCLUDED.structure,
          is_active     = EXCLUDED.is_active,
          sort_order    = EXCLUDED.sort_order,
          updated_at    = NOW()
      `, [
        s.id,
        s.display_label,
        s.language || 'ko',
        JSON.stringify(s.structure),
        s.is_active !== false,
        s.sort_order || 0,
      ]);
      inserted += 1;
    }

    await client.query('COMMIT');

    console.log(`\n✅ Seeded ${inserted} blueprint samples.`);

    // Verification
    const verify = await client.query(`
      SELECT id, display_label, language, is_active, sort_order,
             jsonb_array_length(structure->'chapters') as chapter_count
      FROM blueprint_samples
      ORDER BY sort_order
    `);

    console.log('\n📊 DB state:');
    console.log('   ID            | Label         | Lang | Active | Chapters | Order');
    console.log('   ──────────────┼───────────────┼──────┼────────┼──────────┼──────');
    for (const r of verify.rows) {
      const id = r.id.padEnd(13);
      const label = r.display_label.padEnd(13);
      const lang = r.language.padEnd(4);
      const active = r.is_active ? '  ✅  ' : '  ❌  ';
      const ch = String(r.chapter_count).padStart(8);
      const order = String(r.sort_order).padStart(5);
      console.log(`   ${id} | ${label} | ${lang} |${active}|${ch}  |${order}`);
    }

    console.log('\n📋 Next steps:');
    console.log('   1. Frontend: /architect/sample/[id] 페이지에서 이 샘플들 표시');
    console.log('   2. POST /api/book/start 수정 (sampleId 받기)');
    console.log('   3. Admin UI: /admin/architect/samples (Tim 시나리오 관리)');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
