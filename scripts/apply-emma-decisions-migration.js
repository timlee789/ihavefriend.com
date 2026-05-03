#!/usr/bin/env node
/**
 * scripts/apply-emma-decisions-migration.js  (Stage 3 — Task 90)
 *
 * Idempotent migration:
 *   1. CREATE TABLE emma_decisions IF NOT EXISTS
 *      Logs every analyze+decide cycle: per-turn analysis JSON,
 *      per-turn decision JSON, latency for each, and a consumed_at
 *      pointer the EmmaChat consumer flips after rendering.
 *   2. CREATE INDEX (3): session_turn lookups, unconsumed queue,
 *      action distribution monitoring.
 *   3. ALTER chat_sessions ADD COLUMN dimension_coverage JSONB,
 *      last_emma_action JSONB — both nullable, both IF NOT EXISTS.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-emma-decisions-migration.js
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  console.log('▶ creating emma_decisions table…');
  await sql`
    CREATE TABLE IF NOT EXISTS emma_decisions (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id      UUID        NOT NULL,
      user_id         INTEGER     NOT NULL,
      turn_number     INTEGER     NOT NULL,
      analysis        JSONB,
      decision        JSONB,
      action          TEXT,
      suggested_response TEXT,
      consumed_at     TIMESTAMPTZ,
      analysis_ms     INTEGER,
      decision_ms     INTEGER,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  console.log('▶ creating indexes…');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_emma_decisions_session_turn
      ON emma_decisions (session_id, turn_number DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_emma_decisions_unconsumed
      ON emma_decisions (session_id, created_at DESC)
      WHERE consumed_at IS NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_emma_decisions_action
      ON emma_decisions (action, created_at DESC)
  `;

  console.log('▶ adding chat_sessions columns…');
  await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS dimension_coverage JSONB`;
  await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS last_emma_action   JSONB`;

  console.log('✅ Stage 3 migration applied');
})().catch(e => { console.error(e); process.exit(1); });
