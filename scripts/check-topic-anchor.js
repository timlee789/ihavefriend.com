require('dotenv').config({ path: './.env' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  const sessions = await sql`
    SELECT 
      id, 
      conversation_mode, 
      topic_anchor, 
      total_turns,
      created_at
    FROM chat_sessions
    ORDER BY created_at DESC 
    LIMIT 5
  `;
  console.log('\n=== 최근 chat_sessions (topic_anchor 포함) ===');
  sessions.forEach(s => {
    console.log(`\n  ${s.id.slice(0, 8)}... (${s.created_at})`);
    console.log(`    mode: ${s.conversation_mode}`);
    console.log(`    topic_anchor: ${s.topic_anchor || '(null)'}`);
    console.log(`    turns: ${s.total_turns}`);
  });
  
  // topic_extract 호출 로그
  const extractions = await sql`
    SELECT operation, input_tokens, output_tokens, cost_usd, latency_ms, created_at
    FROM api_usage_logs
    WHERE operation = 'topic_extract'
    ORDER BY created_at DESC LIMIT 5
  `;
  console.log(`\n=== topic_extract 호출 ${extractions.length}개 ===`);
  extractions.forEach(e => {
    console.log(`  tokens=${e.input_tokens}/${e.output_tokens} cost=$${parseFloat(e.cost_usd).toFixed(6)} ${e.latency_ms}ms`);
  });
})();
