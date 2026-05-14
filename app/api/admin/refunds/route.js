/**
 * GET /api/admin/refunds — Tim's read-only refund audit log.
 * Sprint 2AA (2026-05-13).
 *
 * Refund handling is fully automated by Sprint 2Z's webhook (status='refunded',
 * tier downgrades, etc.).  Tim only needs visibility into what happened.
 *
 * Returns the most recent 20 refunded payments, newest first.
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
         p.id, p.amount, p.product_type, p.refunded_at,
         u.email AS user_email, u.name AS user_name
       FROM payments p
       JOIN "User" u ON u.id = p.user_id
       WHERE p.status = 'refunded'
       ORDER BY p.refunded_at DESC NULLS LAST
       LIMIT 20`,
      []
    );

    return NextResponse.json({ refunds: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/refunds]', err.message);
    return NextResponse.json(
      { error: 'db_error', detail: err.message },
      { status: 500 }
    );
  }
}
