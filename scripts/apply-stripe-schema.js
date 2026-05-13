#!/usr/bin/env node
/**
 * scripts/apply-stripe-schema.js  (Sprint 2W, 2026-05-13)
 *
 * Adds the Stripe payments infra (Two Separate Checkout pattern):
 *   1. NEW table `payments` — one row per Stripe checkout session.
 *      product_type ∈ ('premium', 'book') — Tim 결정 2-A: $60 + $139 분리.
 *      status ∈ ('pending', 'paid', 'refunded', 'failed').
 *   2. Adds payment-tracking columns to "User":
 *      premium_paid_at      — 가입 시 $60 결제 완료
 *      premium_expires_at   — premium_paid_at + 6 개월 (Tim 결정 11-A)
 *      book_paid_at         — 책 인쇄 $139 결제 완료 (premium 안에서 언제든)
 *      book_fulfilled_at    — Tim 의 manual print fulfillment 완료 시점
 *
 * Idempotent. Matches the existing apply-tier-defaults.js / apply-quota-
 * schema.js pattern — raw SQL via @neondatabase/serverless.
 *
 * 중요: User.id 는 INTEGER (Prisma model). payments.user_id 도 INTEGER
 *      로 FK. (strategy doc 의 UUID 는 typo — 검증된 schema 와 일관.)
 *
 * 영구 baseline (Tim 결정 영구 기록):
 *   "$60: 가입 + 6 개월 사용권 (이 안에 책 인쇄 신청 가능)"
 *   "$139: 책 인쇄 신청 시 (6 개월 안 언제든)"
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-stripe-schema.js
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  // pgcrypto for gen_random_uuid(). Neon Postgres has this available;
  // CREATE EXTENSION IF NOT EXISTS is no-op on subsequent runs.
  console.log('▶ ensuring pgcrypto extension (for gen_random_uuid)…');
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

  console.log('▶ creating payments table…');
  await sql`
    CREATE TABLE IF NOT EXISTS payments (
      id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                  INTEGER      NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      stripe_session_id        TEXT         UNIQUE NOT NULL,
      stripe_payment_intent_id TEXT,
      product_type             TEXT         NOT NULL
        CHECK (product_type IN ('premium', 'book')),
      amount                   INTEGER      NOT NULL,   -- cents (6000 = $60.00)
      currency                 TEXT         NOT NULL DEFAULT 'usd',
      status                   TEXT         NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
      created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      refunded_at              TIMESTAMPTZ
    )
  `;

  console.log('▶ creating indexes on payments…');
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_status  ON payments(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(stripe_session_id)`;

  console.log('▶ adding payment-tracking columns to "User"…');
  // 4 nullable columns — null = not paid yet (initial state for every user).
  // Sprint 2X 부터 Stripe webhook 가 결제 성공 시 채움.
  await sql`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS premium_paid_at      TIMESTAMPTZ`;
  await sql`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS premium_expires_at   TIMESTAMPTZ`;
  await sql`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS book_paid_at         TIMESTAMPTZ`;
  await sql`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS book_fulfilled_at    TIMESTAMPTZ`;

  console.log('▶ summary:');
  const cols = await sql`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'payments'
     ORDER BY ordinal_position
  `;
  console.table(cols);

  const userCols = await sql`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'User'
       AND column_name IN ('premium_paid_at', 'premium_expires_at',
                            'book_paid_at', 'book_fulfilled_at')
     ORDER BY column_name
  `;
  console.table(userCols);

  console.log('✅ stripe schema applied');
})().catch(e => { console.error(e); process.exit(1); });
