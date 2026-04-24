require('dotenv').config({ path: './.env' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  // 1. Embedding 상태 (Case D 수정 검증)
  const embeds = await sql`
    SELECT operation, model, success, input_tokens, cost_usd, created_at
    FROM api_usage_logs 
    WHERE operation = 'embedding' 
    ORDER BY created_at DESC LIMIT 10
  `;
  console.log(`\n=== Embedding 최근 ${embeds.length}개 ===`);
  embeds.forEach(e => {
    const icon = e.success ? '✅' : '❌';
    console.log(`  ${icon} ${e.model} tokens=${e.input_tokens} cost=$${parseFloat(e.cost_usd).toFixed(6)}`);
  });
  
  // 2. memory_embeddings 행 수 (핵심 — 이게 늘어났는지)
  const embRows = await sql`SELECT COUNT(*)::int as n FROM memory_embeddings`;
  console.log(`\n=== memory_embeddings: ${embRows[0].n}개 row ===`);
  console.log(embRows[0].n > 0 ? '  ✅ 벡터 저장 성공!' : '  ❌ 여전히 비어있음');
  
  // 3. 최근 memory_node + 대응하는 embedding
  const pairs = await sql`
    SELECT 
      n.label, n.primary_category, n.created_at,
      (SELECT COUNT(*)::int FROM memory_embeddings e WHERE e.memory_id = n.id) as has_embedding
    FROM memory_nodes n
    ORDER BY n.created_at DESC LIMIT 5
  `;
  console.log(`\n=== 최근 memory_nodes + embedding 연결 ===`);
  pairs.forEach(p => {
    const icon = p.has_embedding > 0 ? '✅' : '❌';
    console.log(`  ${icon} [${p.primary_category}] "${p.label.slice(0, 40)}"`);
  });
})().catch(e => console.error('❌', e.message));
