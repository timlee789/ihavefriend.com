require('dotenv').config({ path: './.env' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env');
    process.exit(1);
  }
  
  // 모든 유저에게 .env의 API 키 설정
  const users = await sql`SELECT id, email FROM "User"`;
  for (const u of users) {
    await sql`
      INSERT INTO user_settings (user_id, gemini_api_key, updated_at)
      VALUES (${u.id}, ${apiKey}, now())
      ON CONFLICT (user_id) DO UPDATE 
      SET gemini_api_key = ${apiKey}, updated_at = now()
    `;
    console.log(`  ✅ Set API key for user ${u.id} (${u.email})`);
  }
  
  console.log(`\n총 ${users.length}명에게 API 키 설정 완료`);
})().catch(e => console.error('❌', e.message));
