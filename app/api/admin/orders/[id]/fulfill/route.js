/**
 * POST /api/admin/orders/[id]/fulfill — Tim marks a book payment as
 * reviewed and fulfilled.  Sprint 2AA (2026-05-13).
 *
 * Flow:
 *   1. Validate admin
 *   2. Look up payments row by id; ensure product_type='book'
 *   3. UPDATE "User" SET book_fulfilled_at = NOW() WHERE id = payment.user_id
 *   4. Best-effort Resend email to the user ("Tim 검수 완료").
 *      RESEND_API_KEY missing → console.log + email_sent=false.
 *      Email failure never blocks the fulfillment — DB is the source of truth.
 *
 * Lulu Premium Color hardcover ordering itself is still a manual step Tim
 * does outside the app (Moat #5).  This endpoint simply records that he's
 * accepted ownership of the order.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const { id: paymentId } = await params; // Next 15+ async params

  if (!paymentId) {
    return NextResponse.json({ error: 'missing_payment_id' }, { status: 400 });
  }

  const db = createDb();

  try {
    // Look up payment + product type
    const paymentRes = await db.query(
      `SELECT user_id, product_type FROM payments WHERE id = $1`,
      [paymentId]
    );

    if (paymentRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'payment_not_found' },
        { status: 404 }
      );
    }

    const { user_id: userId, product_type: productType } = paymentRes.rows[0];

    if (productType !== 'book') {
      return NextResponse.json(
        { error: 'not_book_payment' },
        { status: 400 }
      );
    }

    // Mark fulfilled
    await db.query(
      `UPDATE "User" SET book_fulfilled_at = NOW() WHERE id = $1`,
      [userId]
    );

    // Look up user for the notification email
    const userRes = await db.query(
      `SELECT email, name FROM "User" WHERE id = $1`,
      [userId]
    );
    const targetUser = userRes.rows[0];

    // Best-effort email — never blocks the fulfillment write
    let emailSent = false;
    try {
      if (process.env.RESEND_API_KEY && targetUser?.email) {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'SayAndKeep <noreply@sayandkeep.com>',
          to: targetUser.email,
          subject: '✅ Tim 검수 완료 — 책 인쇄가 시작되었어요!',
          html: `
            <p>안녕하세요${targetUser.name ? ' ' + targetUser.name : ''}님,</p>
            <p>Tim 이 직접 검수를 마쳤습니다. 이제 Lulu Premium Color hardcover 로 인쇄를 시작합니다.</p>
            <p>예상 배송: 인쇄 + 배송 ~2-3 주</p>
            <p>감사합니다.<br/>— SayAndKeep</p>
          `,
        });
        emailSent = true;
      } else {
        console.log(
          '[admin/fulfill] no RESEND_API_KEY, email skipped:',
          targetUser?.email
        );
      }
    } catch (emailErr) {
      console.error(
        '[admin/fulfill] email error (non-fatal):',
        emailErr.message
      );
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      email_sent: emailSent,
    });
  } catch (err) {
    console.error('[POST /api/admin/orders/[id]/fulfill]', err.message);
    return NextResponse.json(
      { error: 'fulfill_error', detail: err.message },
      { status: 500 }
    );
  }
}
