require('dotenv').config({ path: './.env' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  const frags = await sql`
    SELECT title, subtitle, content, word_count, truncated, created_at
    FROM story_fragments
    ORDER BY created_at DESC LIMIT 3
  `;
  
  if (frags.length === 0) {
    console.log('\n❌ story_fragments 테이블이 비어있음');
    return;
  }
  
  frags.forEach((f, i) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Fragment ${i+1} (${f.created_at})`);
    console.log(`${'='.repeat(60)}`);
    console.log(`제목: ${f.title}`);
    console.log(`부제: ${f.subtitle || '(없음)'}`);
    console.log(`길이: ${f.word_count}자  |  잘림: ${f.truncated}`);
    console.log(`\n--- 내용 ---`);
    console.log(f.content);
    console.log(`--- 끝 ---`);
  });
})().catch(e => {
  console.error('❌', e.message);
  console.error(e.stack);
});
