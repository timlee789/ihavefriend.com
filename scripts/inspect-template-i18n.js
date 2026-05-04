#!/usr/bin/env node
/**
 * scripts/inspect-template-i18n.js
 *
 * Prints the i18n state of every template's chapter titles + the
 * matching state on every user_books row. Pure diagnostic — no DB
 * writes. Helps catch cases where the template itself is missing
 * a language key (so backfill couldn't fill it because there was
 * nothing to copy).
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  console.log('=== Template default_structure chapter titles ===\n');
  const tmpls = await sql`SELECT id, default_structure FROM book_template_definitions ORDER BY id`;
  for (const t of tmpls) {
    console.log(`\n--- ${t.id} ---`);
    for (const ch of t.default_structure?.chapters || []) {
      const ko = ch.title?.ko || '(missing)';
      const en = ch.title?.en || '(missing)';
      const es = ch.title?.es || '(missing)';
      console.log(`  ${ch.id}: ko="${ko}"  |  en="${en}"  |  es="${es}"`);
    }
  }

  console.log('\n\n=== user_books chapter titles ===\n');
  const books = await sql`SELECT id, user_id, template_id, title, structure FROM user_books ORDER BY user_id, created_at`;
  for (const b of books) {
    console.log(`\n--- book=${b.id} user=${b.user_id} template=${b.template_id} title="${b.title}" ---`);
    for (const ch of b.structure?.chapters || []) {
      const ko = ch.title?.ko || '(missing)';
      const en = ch.title?.en || '(missing)';
      const es = ch.title?.es || '(missing)';
      console.log(`  ${ch.id}: ko="${ko}"  |  en="${en}"  |  es="${es}"`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
