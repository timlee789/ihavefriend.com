require('dotenv').config({ path: './.env' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  // 1. User
  const users = await sql`SELECT id, email FROM "User" ORDER BY id`;
  console.log(`\n=== User ${users.length}명 ===`);
  users.forEach(u => console.log(`  ${u.id}: ${u.email}`));

  // 2. Chat sessions
  const sessions = await sql`
    SELECT id, user_id, total_turns, memories_extracted,
           fragment_candidate, conversation_mode, ended_at, created_at, updated_at
    FROM chat_sessions ORDER BY created_at DESC LIMIT 3
  `;
  console.log(`\n=== chat_sessions (최근 ${sessions.length}개) ===`);
  sessions.forEach(s => {
    console.log(`  ${s.id.slice(0,8)}... user=${s.user_id} turns=${s.total_turns} mode=${s.conversation_mode} ended=${s.ended_at ? '✅' : '진행중'}`);
    console.log(`    memExtracted=${s.memories_extracted} fragCandidate=${s.fragment_candidate}`);
    console.log(`    created=${s.created_at} updated=${s.updated_at}`);
  });

  // 3. Memory nodes
  const memories = await sql`
    SELECT label, primary_category, confidence, recall_priority, emotional_weight, created_at
    FROM memory_nodes ORDER BY created_at DESC LIMIT 10
  `;
  console.log(`\n=== memory_nodes ${memories.length}개 ===`);
  memories.forEach(m => {
    console.log(`  [${m.primary_category}/${m.confidence}/${m.recall_priority}] "${m.label}" weight=${m.emotional_weight}`);
  });

  // 4. Story fragments
  const frags = await sql`
    SELECT id, title, status, voice_style, word_count, truncated, created_at
    FROM story_fragments ORDER BY created_at DESC LIMIT 3
  `;
  console.log(`\n=== story_fragments ${frags.length}개 ===`);
  frags.forEach(f => {
    console.log(`  ${f.id.slice(0,8)}... "${f.title}"`);
    console.log(`    status=${f.status} style=${f.voice_style} words=${f.word_count} truncated=${f.truncated}`);
  });

  // 5. Emotion sessions & turns
  const emSess = await sql`SELECT COUNT(*)::int as n FROM emotion_sessions`;
  const emTurns = await sql`SELECT COUNT(*)::int as n FROM emotion_turns`;
  console.log(`\n=== Emotion tracking ===`);
  console.log(`  emotion_sessions: ${emSess[0].n}`);
  console.log(`  emotion_turns: ${emTurns[0].n}`);

  // 6. API usage (가장 기대되는 부분!)
  const usage = await sql`
    SELECT operation, model, input_tokens, output_tokens, cost_usd, latency_ms, success, created_at
    FROM api_usage_logs ORDER BY created_at DESC LIMIT 15
  `;
  console.log(`\n=== api_usage_logs (${usage.length}개) ===`);
  let totalCost = 0;
  const byOp = {};
  usage.forEach(u => {
    const cost = parseFloat(u.cost_usd);
    totalCost += cost;
    byOp[u.operation] = (byOp[u.operation] || 0) + cost;
    const icon = u.success ? '✅' : '❌';
    console.log(`  ${icon} [${u.operation}] in=${u.input_tokens} out=${u.output_tokens} $${cost.toFixed(6)} ${u.latency_ms}ms`);
  });

  if (usage.length > 0) {
    console.log(`\n💰 총 비용 (최근 ${usage.length}회): $${totalCost.toFixed(6)}`);
    console.log(`\n📊 Operation별:`);
    Object.entries(byOp).forEach(([op, cost]) => {
      console.log(`  ${op}: $${cost.toFixed(6)}`);
    });
  }

  // 7. UserMemory
  const um = await sql`SELECT "userId", "characterId" FROM "UserMemory" ORDER BY "userId"`;
  console.log(`\n=== UserMemory ${um.length}개 ===`);
  um.forEach(x => console.log(`  user ${x.userId}: ${x.characterId}`));
})().catch(e => {
  console.error('\n❌ ERROR:', e.message);
  console.error(e.stack);
});
