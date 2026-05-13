/**
 * POST /api/checkout/premium  (Sprint 2X, 2026-05-13).
 *
 * Tim 결정 2-A (Two Separate Checkout): $60 Premium + $139 Book Print 분리.
 * 이 endpoint = $60 Premium (가입 + 6 개월 사용권).
 *
 * Flow:
 *   1. requireAuth (로그인 사용자만)
 *   2. tier='premium' 또는 'unlimited' 면 거절 (중복 결제)
 *   3. 1 시간 안 pending premium 결제 있으면 거절 (중복 방지)
 *   4. Stripe Checkout Session 생성 (one-time payment, USD, $60)
 *   5. payments table 에 pending row INSERT (status='pending')
 *   6. { sessionId, url } 반환 — client redirect
 *
 * Webhook (Sprint 2Y) 가 payment_intent.succeeded 받으면:
 *   - payments.status='paid'
 *   - User.tier='premium'
 *   - User.premium_paid_at=NOW(), premium_expires_at=NOW()+6개월
 *
 * Sprint 2X 의 검증: payments 의 status='pending' 그대로 (webhook 없음).
 */
import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  // 1. Auth
  const { user, error } = await requireAuth(request);
  if (error) return error;

  // Stripe env check (graceful — clear error vs cryptic Stripe SDK throw).
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'stripe_not_configured',
        message: '결제 시스템이 아직 준비 중이에요. 잠시 후 다시 시도해주세요.' },
      { status: 503 }
    );
  }
  if (!process.env.STRIPE_PREMIUM_PRICE_ID) {
    console.error('[checkout/premium] STRIPE_PREMIUM_PRICE_ID not set');
    return NextResponse.json(
      { error: 'stripe_not_configured',
        message: '결제 시스템이 아직 준비 중이에요.' },
      { status: 503 }
    );
  }

  const db = createDb();

  try {
    // 2. 이미 premium / unlimited 인지
    const userRes = await db.query(
      `SELECT tier, premium_paid_at, email FROM "User" WHERE id = $1`,
      [user.id]
    );
    if (userRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'user_not_found' },
        { status: 404 }
      );
    }
    const userData = userRes.rows[0];
    if (userData.tier === 'premium' || userData.tier === 'unlimited') {
      return NextResponse.json(
        { error: 'already_premium',
          message: '이미 Premium 회원이세요.' },
        { status: 400 }
      );
    }

    // 3. Pending checkout 중복 방지 (1 시간 안)
    const pending = await db.query(
      `SELECT id FROM payments
        WHERE user_id = $1
          AND product_type = 'premium'
          AND status = 'pending'
          AND created_at > NOW() - INTERVAL '1 hour'
        LIMIT 1`,
      [user.id]
    );
    if (pending.rows.length > 0) {
      return NextResponse.json(
        { error: 'pending_checkout',
          message: '진행 중인 결제가 있어요. 잠시 후 다시 시도해 주세요.' },
        { status: 400 }
      );
    }

    // 4. Stripe Checkout Session
    const stripe = getStripe();
    // baseUrl 우선순위: NEXT_PUBLIC_BASE_URL → host header (Vercel) → localhost fallback.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || `https://${request.headers.get('host') || 'localhost:3000'}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_PREMIUM_PRICE_ID,
        quantity: 1,
      }],
      success_url: `${baseUrl}/checkout/success?type=premium&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/checkout/canceled?type=premium`,
      customer_email: userData.email || user.email,
      metadata: {
        user_id: String(user.id),
        product_type: 'premium',
      },
      // Tim 결정 4-B: 7 일 환불 정책 안내 (Stripe Checkout 페이지에 표시).
      custom_text: {
        submit: {
          message: '결제 후 7일 이내 환불 가능. 가입 + 6 개월 사용권 (이 안에 책 인쇄 신청 가능).',
        },
      },
    });

    // 5. payments pending record. INSERT 실패해도 Stripe session 은 이미
    //   생성됐으니, 일단 user 에게 url 은 돌려줌 (recovery 는 webhook 또는
    //   manual 처리). 단, log 는 남김.
    try {
      await db.query(
        `INSERT INTO payments
           (user_id, stripe_session_id, product_type, amount, currency, status)
         VALUES ($1, $2, 'premium', 6000, 'usd', 'pending')`,
        [user.id, session.id]
      );
    } catch (e) {
      console.error('[checkout/premium] payments INSERT failed:', e?.message);
      // Continue — Stripe is source of truth; webhook can still reconcile.
    }

    console.log(`[checkout/premium] user=${user.id} session=${session.id} amount=$60`);

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    console.error('[checkout/premium] Stripe error:', err?.message || err);
    return NextResponse.json(
      { error: 'stripe_error',
        message: '결제 시스템 오류. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    );
  }
}
