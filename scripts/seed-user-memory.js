require('dotenv').config({ path: './.env' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  const users = await sql`SELECT id, email FROM "User"`;
  for (const u of users) {
    await sql`
      INSERT INTO "UserMemory" ("userId", "characterId", "factsJson", "summary", "transcriptJson", "updatedAt")
      VALUES (${u.id}, 'emma', '[]', '', '[]', NOW())
      ON CONFLICT ("userId", "characterId") DO NOTHING
    `;
    console.log(`✅ UserMemory seeded for user ${u.id} (${u.email})`);
  }
})().catch(e => console.error('❌', e.message));
