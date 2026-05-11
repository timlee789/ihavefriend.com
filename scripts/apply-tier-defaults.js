#!/usr/bin/env node
/**
 * scripts/apply-tier-defaults.js  (Sprint 2j V2, 2026-05-11)
 *
 * Adds the admin-configurable quota infra:
 *   1. NEW table `tier_defaults` — per-tier default quotas (free/premium/unlimited)
 *   2. Adds override columns to `user_limits` — per-user overrides (nullable)
 *   3. Seeds `tier_defaults` with Tim's V2 sweet-spot values
 *
 * Idempotent. Matches the existing apply-quota-schema.js pattern — raw SQL
 * via @neondatabase/serverless, bypasses Prisma migrate (production has
 * tier/free_token_limit columns added via the same script pattern).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-tier-defaults.js
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  console.log('▶ creating tier_defaults table…');
  await sql`
    CREATE TABLE IF NOT EXISTS tier_defaults (
      tier                TEXT      PRIMARY KEY,
      daily_minutes       INT       NOT NULL DEFAULT 10,
      monthly_minutes     INT       NOT NULL DEFAULT 30,
      max_fragments       INT       NOT NULL DEFAULT 5,
      max_photos          INT       NOT NULL DEFAULT 3,
      max_books           INT       NOT NULL DEFAULT 1,
      allow_pdf           BOOLEAN   NOT NULL DEFAULT FALSE,
      allow_audio_qr      BOOLEAN   NOT NULL DEFAULT FALSE,
      allow_sharing       BOOLEAN   NOT NULL DEFAULT FALSE,
      data_retention_days INT       NOT NULL DEFAULT 30,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  console.log('▶ seeding tier_defaults (V2 Tim sweet-spot)…');
  await sql`
    INSERT INTO tier_defaults
      (tier, daily_minutes, monthly_minutes, max_fragments, max_photos, max_books,
       allow_pdf, allow_audio_qr, allow_sharing, data_retention_days)
    VALUES
      ('free',      10,   30,    5,    3,    1,    FALSE, FALSE, FALSE, 30),
      ('premium',   60,   1800,  200,  100,  3,    TRUE,  TRUE,  TRUE,  99999),
      ('unlimited', 9999, 99999, 9999, 9999, 9999, TRUE,  TRUE,  TRUE,  99999)
    ON CONFLICT (tier) DO NOTHING
  `;

  console.log('▶ adding override columns to user_limits…');
  // Existing user_limits has: user_id, daily_minutes, monthly_minutes, memory_kb.
  // Sprint 2j adds NULLABLE override columns (NULL = use tier default).
  // Note: existing daily_minutes / monthly_minutes are NOT NULL with defaults.
  //   Sprint 2j treats them as overrides too (the existing values become
  //   user-specific values); for resolution, getUserQuotas() will check
  //   if value differs from tier default — but simpler: just treat them as
  //   non-null override columns (Tim's UI lets admin clear them).
  //   New columns are purely nullable.
  await sql`ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS max_fragments        INT`;
  await sql`ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS max_photos           INT`;
  await sql`ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS max_books            INT`;
  await sql`ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS allow_pdf            BOOLEAN`;
  await sql`ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS allow_audio_qr       BOOLEAN`;
  await sql`ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS allow_sharing        BOOLEAN`;
  await sql`ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS data_retention_days  INT`;

  console.log('▶ ensuring Tim (admin@companionai.com / systeco@hotmail.com) is unlimited…');
  // Match by either email — Tim has two admin accounts in different envs.
  await sql`
    UPDATE "User"
       SET tier = 'unlimited'
     WHERE email IN ('systeco@hotmail.com', 'admin@companionai.com')
        OR role = 'admin'
  `;

  console.log('▶ summary:');
  const tierRows = await sql`SELECT * FROM tier_defaults ORDER BY tier`;
  console.table(tierRows);
  const admins = await sql`SELECT id, email, tier, role FROM "User" WHERE tier = 'unlimited' OR role = 'admin'`;
  console.table(admins);

  console.log('✅ tier defaults applied');
})().catch(e => { console.error(e); process.exit(1); });
