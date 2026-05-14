/**
 * POST /api/webhooks/stripe  (Sprint 2Z, 2026-05-13).
 *
 * Stripe webhook handler — Sprint 2W (schema) + 2X (Checkout) 의 마지막
 * piece. Stripe 가 결제 / 환불 events 를 이 endpoint 로 POST → DB sync.
 *
 * Tim 11 결정 적용:
 *   2-A: Two Separate Checkout — product_type 'premium' / 'book' 분리.
 *   4-B: 7 일 환불 + Tim 수동 (Stripe Dashboard 에서 refund 클릭).
 *   8-B: Tim 수동 검수 (book 결제 시 알림 → admin/orders).
 *   9-A: 환불 시 tier='free' 자동 (premium refund). book refund 시 premium tier 유지.
 *   11-A: 책 인쇄는 Premium 결제 후 즉시 가능 (별도 결제).
 *
 * Handled events:
 *   - checkout.session.completed: payments.status='paid' + User.tier/dates.
 *   - charge.refunded:            payments.status='refunded' + User.tier 복원.
 *   - charge.refund.updated:      same handler (idempotent — 중복 webhook 안전).
 *
 * 안전 설계:
 *   - Signature verification (STRIPE_WEBHOOK_SECRET) — 위변조 방지.
 *   - Raw body via request.text() (signature check 전 JSON parse 금지).
 *   - runtime='nodejs' (Buffer / Stripe SDK 필요, Edge runtime X).
 *   - Idempotency: payments.status='pending' / 'paid' check.
 *     같은 event 여러 번 받아도 첫 처리만 effective (UPDATE rowCount=0
 *     이면 already processed).
 *   - 이메일 실패해도 webhook 응답은 200 (DB sync 가 source of truth).
 *
 * Tim 수동 작업:
 *   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
 *      URL: https://sayandkeep.com/api/webhooks/stripe
 *      Events: checkout.session.completed + charge.refunded + charge.refund.updated
 *   2. Signing secret 복사 → .env + Vercel env: STRIPE_WEBHOOK_SECRET="whsec_..."
 *   3. 로컬 test: stripe listen --forward-to localhost:3000/api/webhooks/stripe
 */
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getStripe } from '@/lib/stripe';
import { createDb } from '@/lib/db';

// 🔥 Critical: nodejs runtime (Buffer + Stripe SDK 필수). Edge runtime
//   에선 stripe.webhooks.constructEvent 가 throw (Buffer 지원 X).
export const runtime = 'nodejs';
// 캐싱 X — webhook 은 항상 신선하게 처리.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json(
      { error: 'config', message: 'webhook secret not configured' },
      { status: 500 }
    );
  }

  // 🔒 Raw body — signature verification 전에 JSON parse 절대 금지.
  //   Next.js 의 request.text() 가 raw body 반환 (Stripe SDK 호환).
  const body = await request.text();
  const signature = (await headers()).get('stripe-signature');

  if (!signature) {
    console.warn('[stripe webhook] no stripe-signature header');
    return NextResponse.json({ error: 'no_signature' }, { status: 400 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    console.error('[stripe webhook] getStripe() failed:', err?.message);
    return NextResponse.json({ error: 'stripe_init' }, { status: 500 });
  }

  // 🔒 Signature verification — Stripe 의 secret 으로 HMAC check.
  //   위변조된 request 또는 다른 webhook origin 은 여기서 차단.
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe webhook] signature error:', err?.message);
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  const db = createDb();

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        return await handleCheckoutCompleted(db, event);

      case 'charge.refunded':
      case 'charge.refund.updated':
        return await handleChargeRefunded(db, event);

      default:
        // 다른 events 는 무시 (webhook endpoint 가 다양한 events 받을 수
        // 있도록 Stripe 가 over-deliver 할 때 대비).
        console.log('[stripe webhook] ignored event:', event.type);
        return NextResponse.json({ received: true, ignored: event.type });
    }
  } catch (err) {
    console.error('[stripe webhook] handler error:', err);
    return NextResponse.json(
      { error: 'handler_error', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// checkout.session.completed
//   product_type='premium' → User.tier='premium' + premium_paid_at +
//                            premium_expires_at = NOW() + 6 months
//   product_type='book'    → User.book_paid_at + Tim 알림 이메일
// ─────────────────────────────────────────────────────────────────
async function handleCheckoutCompleted(db, event) {
  const session = event.data.object;
  const userId = parseInt(session.metadata?.user_id, 10);
  const productType = session.metadata?.product_type;

  if (!Number.isFinite(userId) || !productType) {
    console.warn('[stripe webhook] missing/invalid metadata:',
      { sessionId: session.id, userId, productType });
    // 200 OK — Stripe 가 retry 안 하도록. 이런 session 은 handler 에서
    // recover 불가능 (metadata 깨짐).
    return NextResponse.json({ received: true, error: 'bad_metadata' });
  }

  // Idempotency: 'pending' → 'paid' 만 update. 이미 'paid'/'refunded' 면 0 row.
  const updateRes = await db.query(
    `UPDATE payments
        SET status = 'paid',
            stripe_payment_intent_id = $1,
            updated_at = NOW()
      WHERE stripe_session_id = $2
        AND status = 'pending'
      RETURNING id, product_type, amount`,
    [session.payment_intent || null, session.id]
  );

  if (updateRes.rows.length === 0) {
    // 이미 처리됐거나 (중복 webhook), payments record 없음 (다른 이유).
    // Idempotent — Stripe 가 retry 해도 안전.
    console.log('[stripe webhook] checkout already processed or no pending row:', session.id);
    return NextResponse.json({ received: true, idempotent: true });
  }

  if (productType === 'premium') {
    // Tim 결정 11-A: $60 결제 = 가입 + 6 개월 사용권. premium_expires_at
    //   가 그 6 개월 만료. (Tim 결정 10-C: 만료 후 데이터 보존 + tier='free'.)
    await db.query(
      `UPDATE "User"
          SET tier = 'premium',
              premium_paid_at    = NOW(),
              premium_expires_at = NOW() + INTERVAL '6 months'
        WHERE id = $1`,
      [userId]
    );
    console.log(`[stripe webhook] premium activated user=${userId} session=${session.id}`);
    return NextResponse.json({ received: true, processed: 'premium', userId });
  }

  if (productType === 'book') {
    // Tim 결정 8-B (Moat #5): book 결제 후 Tim 이 수동 검수 → Lulu 발주.
    //   user.book_paid_at 만 set. book_fulfilled_at 은 Tim 이 admin/orders
    //   에서 수동 set (Sprint 2AA).
    await db.query(
      `UPDATE "User" SET book_paid_at = NOW() WHERE id = $1`,
      [userId]
    );
    console.log(`[stripe webhook] book paid user=${userId} session=${session.id}`);

    // Tim 알림 이메일 (best-effort — 실패해도 webhook 200).
    try {
      const userRes = await db.query(
        `SELECT email, name FROM "User" WHERE id = $1`,
        [userId]
      );
      const user = userRes.rows[0];
      if (user) {
        await sendBookPaymentNotification({
          userId,
          email: user.email,
          name: user.name,
          sessionId: session.id,
        });
      }
    } catch (emailErr) {
      // 이메일 실패해도 webhook 은 성공 (DB sync 가 source of truth).
      console.error('[stripe webhook] book notification email failed:',
        emailErr?.message || emailErr);
    }

    return NextResponse.json({ received: true, processed: 'book', userId });
  }

  // Unknown product_type — 안전 fallback (already paid 처리, no User update).
  console.warn(`[stripe webhook] unknown product_type=${productType} session=${session.id}`);
  return NextResponse.json({ received: true, warning: 'unknown_product' });
}

// ─────────────────────────────────────────────────────────────────
// charge.refunded / charge.refund.updated
//   Tim 수동 환불 (Stripe Dashboard) 후 webhook.
//   Tim 결정 9-A: premium refund → tier='free' 복원, dates NULL.
//                  book refund → book_paid_at NULL (premium tier 유지).
//
// Idempotency: payments.status='paid' → 'refunded' 만 update.
//   이미 'refunded' 면 0 row → no-op. Stripe 의 charge.refund.updated
//   (refund status change) event 도 같은 handler — 안전.
// ─────────────────────────────────────────────────────────────────
async function handleChargeRefunded(db, event) {
  const charge = event.data.object;
  const paymentIntentId = charge.payment_intent;

  if (!paymentIntentId) {
    console.warn('[stripe webhook] refund event missing payment_intent:', event.id);
    return NextResponse.json({ received: true, error: 'no_payment_intent' });
  }

  const updateRes = await db.query(
    `UPDATE payments
        SET status = 'refunded',
            refunded_at = NOW(),
            updated_at = NOW()
      WHERE stripe_payment_intent_id = $1
        AND status = 'paid'
      RETURNING user_id, product_type`,
    [paymentIntentId]
  );

  if (updateRes.rows.length === 0) {
    // 이미 refunded 처리됐거나, payments record 없음 (charge 가 SayAndKeep
    // 외부 결제). Idempotent.
    console.log('[stripe webhook] refund: no matching paid payment:', paymentIntentId);
    return NextResponse.json({ received: true, idempotent: true });
  }

  const { user_id: userId, product_type: productType } = updateRes.rows[0];

  if (productType === 'premium') {
    // Tim 결정 9-A: premium 환불 → tier='free' 복원, dates NULL.
    //   사용자 데이터 (fragments, books) 는 보존 (Tim 결정 10-C).
    //   다만 quota 가 free tier 로 줄어 — 새 fragment/photo 추가 차단.
    await db.query(
      `UPDATE "User"
          SET tier = 'free',
              premium_paid_at    = NULL,
              premium_expires_at = NULL
        WHERE id = $1`,
      [userId]
    );
    console.log(`[stripe webhook] premium refunded → tier='free' user=${userId}`);
    return NextResponse.json({ received: true, processed: 'premium_refund', userId });
  }

  if (productType === 'book') {
    // Book 환불: book_paid_at 만 NULL (premium tier 유지). 사용자가
    // 다시 book 결제 가능 ($139 재결제 시 book_paid_at 다시 set).
    await db.query(
      `UPDATE "User" SET book_paid_at = NULL WHERE id = $1`,
      [userId]
    );
    console.log(`[stripe webhook] book refunded user=${userId}`);
    return NextResponse.json({ received: true, processed: 'book_refund', userId });
  }

  console.warn(`[stripe webhook] unknown product_type=${productType} on refund`);
  return NextResponse.json({ received: true, warning: 'unknown_product' });
}

// ─────────────────────────────────────────────────────────────────
// Tim 알림 이메일 (book payment).
//   기존 lib/emailClient.js 가 sendPrintRequestEmail 만 export — 책 결제
//   알림은 새 함수가 필요. 단 best-effort: Resend 없으면 console.log.
//   이메일 실패해도 webhook 은 성공 (DB sync 우선).
// ─────────────────────────────────────────────────────────────────
async function sendBookPaymentNotification({ userId, email, name, sessionId }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(
      `[stripe webhook] (no Resend) book payment notification: ` +
      `userId=${userId} name=${name || '(unset)'} email=${email} session=${sessionId}`
    );
    return;
  }

  // Lazy require — Resend SDK 가 다른 routes 에 안 끌려 들어가도록.
  let Resend;
  try {
    Resend = require('resend').Resend;
  } catch (e) {
    console.warn('[stripe webhook] resend module not available:', e?.message);
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const adminEmail = process.env.ADMIN_EMAIL || 'tim@thecollegiategrill.com';

  await resend.emails.send({
    from: 'SayAndKeep <orders@sayandkeep.com>',
    to: adminEmail,
    subject: `SayAndKeep — 새 책 인쇄 신청 (user ${userId})`,
    text: [
      'SayAndKeep — 새 책 인쇄 신청이 들어왔어요.',
      '',
      `사용자: ${name || '(이름 미설정)'} (id=${userId})`,
      `이메일: ${email}`,
      `Stripe session: ${sessionId}`,
      '',
      '👉 admin 검수 + Lulu 발주 진행해 주세요:',
      '   https://sayandkeep.com/admin/orders   (Sprint 2AA)',
      '',
      'Tim 결정 8-B (Moat #5): 모든 책 = Tim 직접 검수.',
      '7 일 안 환불 가능 (Stripe Dashboard refund).',
    ].join('\n'),
  });

  console.log(`[stripe webhook] book notification email sent → ${adminEmail}`);
}
