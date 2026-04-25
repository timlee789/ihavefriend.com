require('dotenv').config({ path: './.env' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  // 모든 root fragments
  const roots = await sql`
    SELECT id, title, content, word_count, truncated, created_at
    FROM story_fragments
    WHERE parent_fragment_id IS NULL
    ORDER BY created_at ASC
  `;

  console.log(`\n=== 전체 Fragment Tree (${roots.length} roots) ===\n`);

  for (const p of roots) {
    console.log('━'.repeat(60));
    console.log(`📄 ${p.title}  (${p.word_count}자, ${p.created_at.toISOString().slice(0, 10)})`);
    console.log(`   ID: ${p.id}`);

    const children = await sql`
      SELECT id, title, word_count, truncated, thread_order, created_at
      FROM story_fragments
      WHERE parent_fragment_id = ${p.id}
      ORDER BY thread_order ASC NULLS LAST, created_at ASC
    `;

    if (children.length === 0) {
      console.log('   (no continuations yet)');
    } else {
      children.forEach(c => {
        const truncMark = c.truncated ? ' ⚠️ truncated' : '';
        console.log(`   ↳ #${c.thread_order} ${c.title}  (${c.word_count}자, ${c.created_at.toISOString().slice(0, 10)})${truncMark}`);
      });
    }
    console.log('');
  }

  // 통계
  const stats = await sql`
    SELECT 
      COUNT(*) FILTER (WHERE parent_fragment_id IS NULL) AS roots,
      COUNT(*) FILTER (WHERE parent_fragment_id IS NOT NULL) AS continuations,
      COUNT(*) AS total
    FROM story_fragments
  `;
  console.log('━'.repeat(60));
  console.log(`Total: ${stats[0].total} fragments (${stats[0].roots} roots + ${stats[0].continuations} continuations)`);
})();
