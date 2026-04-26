/**
 * scripts/check-production-state.js
 *
 * Read-only inspection of the production Neon DB.
 * Lists tables, enums, key row counts, extensions, and embedding indexes.
 *
 * Usage:
 *   PROD_DATABASE_URL="postgresql://..." node scripts/check-production-state.js
 *
 * Safe: only SELECT queries. No mutations.
 */

const { neon } = require('@neondatabase/serverless');

const PROD_URL = process.env.PROD_DATABASE_URL;
if (!PROD_URL) {
  console.error('❌ PROD_DATABASE_URL not set');
  console.error('Run with: PROD_DATABASE_URL="postgresql://..." node scripts/check-production-state.js');
  process.exit(1);
}

const sql = neon(PROD_URL);

(async () => {
  console.log('🔍 Inspecting production DB (read-only)\n');

  // 1. Tables
  let tableCount = 0;
  try {
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    tableCount = tables.length;
    console.log(`📋 Tables (${tableCount}):`);
    tables.forEach(t => console.log(`  - ${t.table_name}`));
    console.log('');
  } catch (err) {
    console.error('❌ Could not list tables:', err.message);
  }

  // 2. Enums
  try {
    const enums = await sql`
      SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname
    `;
    console.log(`🏷️  Enums (${enums.length}):`);
    enums.forEach(e => console.log(`  - ${e.typname}`));
    console.log('');
  } catch (err) {
    console.error('❌ Could not list enums:', err.message);
  }

  // 3. Extensions
  try {
    const ext = await sql`
      SELECT extname FROM pg_extension
      WHERE extname IN ('vector', 'uuid-ossp', 'pgcrypto')
      ORDER BY extname
    `;
    console.log(`🧩 Extensions: [${ext.map(e => e.extname).join(', ') || '(none of vector/uuid-ossp/pgcrypto)'}]`);
  } catch (err) {
    console.error('❌ Could not list extensions:', err.message);
  }

  // 4. Embedding indexes
  try {
    const idx = await sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname LIKE '%embedding%'
      ORDER BY indexname
    `;
    console.log(`📐 Embedding indexes (${idx.length}):`);
    idx.forEach(i => console.log(`  - ${i.indexname}`));
    console.log('');
  } catch (err) {
    console.error('❌ Could not list embedding indexes:', err.message);
  }

  // 5. Key row counts
  const tryCount = async (label, fn) => {
    try {
      const r = await fn();
      console.log(`${label}: ${r[0].count}`);
    } catch {
      console.log(`${label}: (table not found)`);
    }
  };

  await tryCount('👥 Users ("User")', () => sql`SELECT COUNT(*)::int AS count FROM "User"`);
  await tryCount('📄 Story Fragments', () => sql`SELECT COUNT(*)::int AS count FROM story_fragments`);
  await tryCount('📚 User Collections', () => sql`SELECT COUNT(*)::int AS count FROM user_collections`);
  await tryCount('💬 Chat Sessions', () => sql`SELECT COUNT(*)::int AS count FROM chat_sessions`);
  await tryCount('🧠 Memory Nodes', () => sql`SELECT COUNT(*)::int AS count FROM memory_nodes`);

  console.log('\n✅ Inspection complete');
})();
