#!/usr/bin/env node
/**
 * scripts/seed-architect-libraries.js
 *
 * Seeds chapter_library + question_library tables from JSON files
 * in data/architect/.
 *
 * Idempotent — uses ON CONFLICT (id) DO UPDATE so re-running updates
 * existing rows. Tim 이 admin UI 만들기 전까지 JSON 파일 직접 수정 →
 * 이 스크립트 재실행으로 변경 가능.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/seed-architect-libraries.js
 *
 * Optional flags:
 *   --dry-run          INSERT 시도 안 하고 검증만
 *   --language=ko      특정 언어만 seed (default: 모든 언어)
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const DRY_RUN = process.argv.includes('--dry-run');
const LANG_ARG = process.argv.find(a => a.startsWith('--language='));
const LANG_FILTER = LANG_ARG ? LANG_ARG.split('=')[1] : null;

const DATA_DIR = path.join(__dirname, '..', 'data', 'architect');

// 어떤 파일을 seed 할지 — 패턴: {chapter,question}-library-{lang}.json
function findLibraryFiles() {
  const files = fs.readdirSync(DATA_DIR);
  const result = { chapter: [], question: [] };
  
  for (const f of files) {
    const m = f.match(/^(chapter|question)-library-([a-z]{2})\.json$/);
    if (!m) continue;
    const [, type, lang] = m;
    if (LANG_FILTER && lang !== LANG_FILTER) continue;
    result[type].push({ file: f, lang, path: path.join(DATA_DIR, f) });
  }
  
  return result;
}

async function seedChapters(client, files) {
  let total = 0;
  for (const { file, lang, path: fpath } of files) {
    const data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
    const chapters = data.chapters || [];
    
    console.log(`\n📚 ${file}: ${chapters.length} chapters (${lang})`);
    
    for (const ch of chapters) {
      // Validate
      if (!ch.id || !ch.title || !ch.category) {
        console.warn(`   ⚠️  skip invalid chapter:`, ch.id || '(no id)');
        continue;
      }
      
      if (DRY_RUN) {
        console.log(`   [dry-run] ${ch.id} — ${ch.title}`);
        continue;
      }
      
      await client.query(`
        INSERT INTO chapter_library
          (id, title, description, language, category, tags, is_general, sort_order, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          language = EXCLUDED.language,
          category = EXCLUDED.category,
          tags = EXCLUDED.tags,
          is_general = EXCLUDED.is_general,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
      `, [
        ch.id,
        ch.title,
        ch.description || null,
        lang,
        ch.category,
        ch.tags || [],
        !!ch.is_general,
        ch.sort_order || 0,
      ]);
      total += 1;
    }
    
    console.log(`   ✅ ${chapters.length} processed`);
  }
  return total;
}

async function seedQuestions(client, files) {
  let total = 0;
  for (const { file, lang, path: fpath } of files) {
    const data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
    const questions = data.questions || [];
    
    console.log(`\n❓ ${file}: ${questions.length} questions (${lang})`);
    
    for (const q of questions) {
      // Validate
      if (!q.id || !q.question_text || !q.category) {
        console.warn(`   ⚠️  skip invalid question:`, q.id || '(no id)');
        continue;
      }
      
      if (DRY_RUN) {
        console.log(`   [dry-run] ${q.id} — ${q.question_text}`);
        continue;
      }
      
      await client.query(`
        INSERT INTO question_library
          (id, question_text, description, language, category, tags, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          question_text = EXCLUDED.question_text,
          description = EXCLUDED.description,
          language = EXCLUDED.language,
          category = EXCLUDED.category,
          tags = EXCLUDED.tags,
          updated_at = NOW()
      `, [
        q.id,
        q.question_text,
        q.description || null,
        lang,
        q.category,
        q.tags || [],
      ]);
      total += 1;
    }
    
    console.log(`   ✅ ${questions.length} processed`);
  }
  return total;
}

(async () => {
  console.log('🌱 SayAndKeep Architect Library Seeder');
  console.log(`   Data dir: ${DATA_DIR}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`   Language filter: ${LANG_FILTER || 'all'}\n`);

  const files = findLibraryFiles();
  console.log(`📁 Found:`);
  console.log(`   chapter files: ${files.chapter.length}`);
  console.log(`   question files: ${files.question.length}`);

  if (files.chapter.length === 0 && files.question.length === 0) {
    console.error('\n❌ No library files found.');
    console.error(`   Expected pattern: data/architect/{chapter,question}-library-{lang}.json`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: URL });
  const client = await pool.connect();

  try {
    if (!DRY_RUN) {
      await client.query('BEGIN');
    }

    const chapterCount = await seedChapters(client, files.chapter);
    const questionCount = await seedQuestions(client, files.question);

    if (!DRY_RUN) {
      await client.query('COMMIT');
    }

    console.log(`\n✅ Done.`);
    console.log(`   Chapters: ${chapterCount}`);
    console.log(`   Questions: ${questionCount}`);

    // Verification
    if (!DRY_RUN) {
      const verifyCh = await client.query(
        'SELECT language, COUNT(*) as count FROM chapter_library GROUP BY language ORDER BY language'
      );
      const verifyQ = await client.query(
        'SELECT language, COUNT(*) as count FROM question_library GROUP BY language ORDER BY language'
      );
      
      console.log('\n📊 DB state:');
      console.log('   chapter_library:');
      for (const r of verifyCh.rows) {
        console.log(`     ${r.language}: ${r.count}`);
      }
      console.log('   question_library:');
      for (const r of verifyQ.rows) {
        console.log(`     ${r.language}: ${r.count}`);
      }
    }

  } catch (err) {
    if (!DRY_RUN) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('❌ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
