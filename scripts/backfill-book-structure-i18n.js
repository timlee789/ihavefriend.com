#!/usr/bin/env node
/**
 * scripts/backfill-book-structure-i18n.js  (Task 69)
 *
 * Walks every user_books row and merges its `structure` JSONB with
 * the matching template's current `default_structure`, adding any
 * missing ko / en / es language keys on chapter titles, descriptions,
 * intro prompts, question prompts, and hints — WITHOUT touching the
 * keys that already exist. Custom (is_custom=true) chapters and
 * questions are left strictly alone; the user authored those, we
 * don't fabricate translations.
 *
 * This is the conservative companion to scripts/refresh-book-structures.js:
 *   • refresh-book-structures.js → reseat structure from template
 *     (overwrites existing prompts with the template's wording)
 *   • backfill-book-structure-i18n.js → preserve existing prompts,
 *     only add missing language keys
 *
 * Per-question/chapter is matched by `id` (NOT by order) so users
 * who reordered survive the merge. Question IDs stay stable across
 * seed updates so user_book_responses keep their links.
 *
 * Idempotent. --dry-run prints planned changes without writing.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/backfill-book-structure-i18n.js --dry-run
 *   DATABASE_URL="postgresql://..." node scripts/backfill-book-structure-i18n.js
 */

const { neon } = require('@neondatabase/serverless');

const DRY_RUN = process.argv.includes('--dry-run');
const LANGS = ['ko', 'en', 'es'];

/**
 * Merge two i18n objects so every existing key is preserved and any
 * missing one is filled from the template. Legacy plain-string values
 * (earliest seeds) are lifted to { ko: <string> }.
 */
function mergeI18n(existing, fromTemplate) {
  if (!existing) return fromTemplate || null;
  const left =
    typeof existing === 'string' ? { ko: existing } : { ...existing };
  if (!fromTemplate || typeof fromTemplate !== 'object') return left;
  for (const lang of LANGS) {
    if (!left[lang] && fromTemplate[lang]) left[lang] = fromTemplate[lang];
  }
  return left;
}

function mergeQuestion(bookQ, tmplQ) {
  if (bookQ?.is_custom) return bookQ;
  if (!tmplQ) return bookQ;
  return {
    ...bookQ,
    prompt: mergeI18n(bookQ.prompt, tmplQ.prompt),
    hint:   mergeI18n(bookQ.hint,   tmplQ.hint),
  };
}

function mergeChapter(bookCh, tmplCh) {
  if (bookCh?.is_custom) return bookCh;
  if (!tmplCh) return bookCh;
  return {
    ...bookCh,
    title:        mergeI18n(bookCh.title,        tmplCh.title),
    description:  mergeI18n(bookCh.description,  tmplCh.description),
    intro_prompt: mergeI18n(bookCh.intro_prompt, tmplCh.intro_prompt),
    questions: (bookCh.questions || []).map(bq => {
      const tq = (tmplCh.questions || []).find(q => q.id === bq.id);
      return mergeQuestion(bq, tq);
    }),
  };
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  // Pull all templates once — small table, simpler than per-book join.
  const tmpls = await sql`
    SELECT id, default_structure FROM book_template_definitions
  `;
  const tmplMap = Object.fromEntries(
    tmpls.map(t => [t.id, t.default_structure])
  );

  const books = await sql`
    SELECT id, user_id, template_id, title, structure FROM user_books
  `;

  console.log(`📚 ${books.length} book(s) to inspect, dry_run=${DRY_RUN}`);
  let touched = 0, untouched = 0, skipped = 0;

  for (const book of books) {
    const tmpl = tmplMap[book.template_id];
    if (!tmpl) {
      console.warn(`  · book=${book.id} template=${book.template_id} not found — skipping`);
      skipped++;
      continue;
    }

    const before = JSON.stringify(book.structure);
    const merged = {
      ...book.structure,
      chapters: (book.structure?.chapters || []).map(bch => {
        const tch = (tmpl.chapters || []).find(c => c.id === bch.id);
        return mergeChapter(bch, tch);
      }),
    };
    const after = JSON.stringify(merged);

    if (before === after) {
      untouched++;
      continue;
    }

    touched++;
    console.log(`  ✏️  book=${book.id} user=${book.user_id} template=${book.template_id} — backfilling i18n`);

    if (!DRY_RUN) {
      await sql`
        UPDATE user_books
           SET structure = ${JSON.stringify(merged)}::jsonb
         WHERE id = ${book.id}
      `;
    }
  }

  console.log(
    `✅ done. touched=${touched} untouched=${untouched} skipped=${skipped}` +
    (DRY_RUN ? ' (DRY RUN — no DB writes)' : '')
  );
})().catch(e => { console.error(e); process.exit(1); });
