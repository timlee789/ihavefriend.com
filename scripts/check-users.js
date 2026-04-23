require('dotenv').config({ path: './.env' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  const users = await sql`SELECT id, email, name, "isActive" FROM "User" ORDER BY id`;
  console.log(`\n=== User: ${users.length}명 ===`);
  users.forEach(u => console.log(`  ${u.id}: ${u.email} (${u.name || '-'}) active=${u.isActive}`));
})().catch(e => console.error('❌', e.message));
