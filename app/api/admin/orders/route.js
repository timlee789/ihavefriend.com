/**
 * GET /api/admin/orders — list of book payments awaiting Tim's fulfillment.
 * Sprint 2AA (2026-05-13).
 *
 * Source of truth:
 *   - payments.product_type='book' AND status='paid'  (set by Sprint 2Z webhook)
 *   - User.book_fulfilled_at IS NULL                  (Tim hasn't reviewed yet)
 *
 * The LEFT JOIN on user_books gives Tim the in-progress book title and category
 * so he can jump straight to /book/[id] for the review.  template_category is
 * the post-Task 71 dedup key, so each (user_id, category) pair is unique.
 *
 * Admin-gated via requireAdmin (lib/auth).
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const db = createDb();

  try {
    const result = await db.query(
      `SELECT
         p.id, p.user_id, p.amount, p.stripe_session_id,
         u.email AS user_email, u.name AS user_name,
         u.book_paid_at,
         ub.title AS book_title,
         ub.template_category,
         ub.id AS book_id
       FROM payments p
       JOIN "User" u ON u.id = p.user_id
       LEFT JOIN user_books ub
         ON ub.user_id = u.id
        AND ub.template_category IN ('memoir', 'story')
       WHERE p.product_type = 'book'
         AND p.status = 'paid'
         AND u.book_fulfilled_at IS NULL
       ORDER BY u.book_paid_at ASC NULLS LAST`,
      []
    );

    return NextResponse.json({ orders: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/orders]', err.message);
    return NextResponse.json(
      { error: 'db_error', detail: err.message },
      { status: 500 }
    );
  }
}
