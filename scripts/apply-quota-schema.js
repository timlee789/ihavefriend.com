#!/usr/bin/env node
/**
 * scripts/apply-quota-schema.js
 *
 * One-shot migration for the Token Quota system (Task 66):
 *   - 4 columns on "User" (Prisma table is capitalised)
 *   - partial index on tier
 *   - sync existing lifetime_tokens_used from api_usage_logs
 *   - mark Tim (id=2) as 'unlimited'
 *
 * Idempotent. Run once on each env (local + prod).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-quota-schema.js
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  console.log('▶ adding quota columns to "User"…');
  await sql`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free'`;
  await sql`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS free_token_limit BIGINT DEFAULT 100000`;
  await sql`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS lifetime_tokens_used BIGINT DEFAULT 0`;
  await sql`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS quota_blocked_at TIMESTAMPTZ`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_tier ON "User" (tier) WHERE tier <> 'unlimited'`;

  console.log('▶ syncing lifetime_tokens_used from api_usage_logs…');
  await sql`
    UPDATE "User" u
       SET lifetime_tokens_used = COALESCE((
         SELECT SUM(total_tokens) FROM api_usage_logs WHERE user_id = u.id
       ), 0)
  `;

  console.log('▶ marking Tim (id=2) as unlimited…');
  await sql`UPDATE "User" SET tier = 'unlimited' WHERE id = 2`;

  const summary = await sql`
    SELECT id, email, tier, free_token_limit, lifetime_tokens_used, quota_blocked_at
      FROM "User"
     ORDER BY id
  `;
  console.table(summary);
  console.log('✅ quota schema applied');
})().catch(e => { console.error(e); process.exit(1); });
