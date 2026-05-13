/**
 * POST /api/checkout/book  (Sprint 2X, 2026-05-13).
 *
 * Tim 결정 2-A (Two Separate Checkout): $60 Premium + $139 Book Print 분리.
 * 이 endpoint = $139 Book Print (자서전 또는 이야기책 1권 인쇄).
 *
 * Tim 결정 11-A: 책 인쇄 = Premium 결제 후 6 개월 안 언제든 가능.
 * Tim 결정 8-B: Tim 수동 검수 (Moat #5). 결제 후 Tim 이 책 검수 → Lulu 발주 → 우편.
 *
 * Flow:
 *   1. requireAuth
 *   2. tier='premium' 또는 'unlimited' AND premium_paid_at 있어야 함
 *      (베타 unlimited 사용자도 책 인쇄 결제는 별도 — 베타는 무료 admin grant
 *       이라 이 endpoint 자체 호출 안 함, 단 안전망)
 *   3. book_paid_at 있으면 거절 (이미 결제, Tim 수동 안내 중)
 *   4. 1 시간 안 pending book 결제 있으면 거절
 *   5. Stripe Checkout Session 생성 ($139)
 *   6. payments table 에 pending row INSERT
 *
 * Webhook (Sprint 2Y) 가 payment_intent.succeeded 받으면:
 *   - payments.status='paid'
 *   - User.book_paid_at=NOW()
 *   - Tim 이 admin 에서 book_fulfilled_at 수동 set (Moat #5)
 */
import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'stripe_not_configured',
        message: '결제 시스템이 아직 준비 중이에요. 잠시 후 다시 시도해 주세요.' },
      { status: 503 }
    );
  }
  if (!process.env.STRIPE_BOOK_PRICE_ID) {
    console.error('[checkout/book] STRIPE_BOOK_PRICE_ID not set');
    return NextResponse.json(
      { error: 'stripe_not_configured',
        message: '결제 시스템이 아직 준비 중이에요.' },
      { status: 503 }
    );
  }

  const db = createDb();

  try {
    const userRes = await db.query(
      `SELECT tier, premium_paid_at, book_paid_at, email
         FROM "User" WHERE id = $1`,
      [user.id]
    );
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }
    const userData = userRes.rows[0];

    // 2. Premium 사용자만 책 인쇄 결제 가능. unlimited (admin/beta) 도 통과.
    //   tier 만 보지 않고 premium_paid_at 도 — 베타 사용자는 admin grant
    //   라서 premium_paid_at 없을 수 있음 (베타는 책 인쇄도 무료, 이 endpoint
    //   호출 안 함). 일반 사용자 가드.
    const isPremium = userData.tier === 'premium' || userData.tier === 'unlimited';
    if (!isPremium) {
      return NextResponse.json(
        { error: 'no_premium',
          message: 'Premium 회원만 책 인쇄 신청 가능해요. 먼저 Premium 가입해 주세요.' },
        { status: 400 }
      );
    }

    // 3. 이미 책 결제 완료 (Tim 수동 진행 중)
    if (userData.book_paid_at) {
      return NextResponse.json(
        { error: 'already_paid_book',
          message: '이미 책 인쇄 결제 완료. Tim 이 곧 안내 드릴게요.' },
        { status: 400 }
      );
    }

    // 4. Pending book checkout 중복 방지
    const pending = await db.query(
      `SELECT id FROM payments
        WHERE user_id = $1
          AND product_type = 'book'
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

    // 5. Stripe Checkout Session
    const stripe = getStripe();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || `https://${request.headers.get('host') || 'localhost:3000'}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_BOOK_PRICE_ID,
        quantity: 1,
      }],
      success_url: `${baseUrl}/checkout/success?type=book&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/checkout/canceled?type=book`,
      customer_email: userData.email || user.email,
      metadata: {
        user_id: String(user.id),
        product_type: 'book',
      },
      // Tim 결정 4-B + 8-B: 7 일 환불 + Tim 수동 검수 안내.
      custom_text: {
        submit: {
          message: '책 인쇄 신청. Tim 검수 후 Lulu Premium Color hardcover 인쇄 + 우편배송. Tim 검수 전까지 7 일 환불 가능.',
        },
      },
    });

    try {
      await db.query(
        `INSERT INTO payments
           (user_id, stripe_session_id, product_type, amount, currency, status)
         VALUES ($1, $2, 'book', 13900, 'usd', 'pending')`,
        [user.id, session.id]
      );
    } catch (e) {
      console.error('[checkout/book] payments INSERT failed:', e?.message);
    }

    console.log(`[checkout/book] user=${user.id} session=${session.id} amount=$139`);

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    console.error('[checkout/book] Stripe error:', err?.message || err);
    return NextResponse.json(
      { error: 'stripe_error',
        message: '결제 시스템 오류. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    );
  }
}
