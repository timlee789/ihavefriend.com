require('dotenv').config({ path: './.env' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  const users = await sql`SELECT id, email, name, "isActive" FROM "User"`;
  console.log(`\n=== User: ${users.length}명 ===`);
  users.forEach(u => console.log(`  ${u.id}: ${u.email} active=${u.isActive}`));
  
  if (users.length === 0) {
    console.log('\n⚠️ 유저 없음 — 회원가입 먼저');
    return;
  }
  
  for (const u of users) {
    const limits = await sql`SELECT * FROM "UserLimit" WHERE "userId" = ${u.id}`;
    const mems = await sql`SELECT * FROM "UserMemory" WHERE "userId" = ${u.id}`;
    const usage = await sql`SELECT * FROM "UsageLog" WHERE "userId" = ${u.id}`;
    const settings = await sql`SELECT * FROM user_settings WHERE user_id = ${u.id}`;
    
    console.log(`\n--- User ${u.id} (${u.email}) ---`);
    console.log(`  UserLimit: ${limits.length}개`);
    console.log(`  UserMemory: ${mems.length}개`);
    console.log(`  UsageLog: ${usage.length}개`);
    console.log(`  user_settings: ${settings.length}개`);
    
    if (limits.length === 0) {
      console.log('  ⚠️ UserLimit 없음 — 생성 필요');
    }
    if (mems.length === 0) {
      console.log('  ⚠️ UserMemory 없음 — 생성 필요');
    }
  }
})().catch(e => console.error('❌', e.message));
