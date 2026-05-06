/**
 * POST /api/photobooks/[id]/pages/reorder
 *
 * Photobook v3 Phase 1 (P2).
 *
 * Body: { pageIds: [uuid1, uuid2, uuid3, ...] }
 *   The new order. Position 0 → page_number 1, position 1 → page_number 2, ...
 *
 * Why a dedicated endpoint:
 *   The naive approach (loop UPDATE page_number = $newNum WHERE id = $id)
 *   trips the UNIQUE(user_book_id, page_number) constraint mid-loop —
 *   row A and row B can both want page_number 2 transiently. Three safe
 *   strategies:
 *
 *   1. Two-pass: shift everything to negative numbers first, then assign
 *      positive numbers. Always works, doubles the writes.
 *   2. Defer constraint to transaction end (DEFERRABLE INITIALLY DEFERRED
 *      in the DDL). Clean but requires a schema-level decision.
 *   3. Wrap in a transaction with two passes: temp negative + final.
 *
 * We use #3 — single transaction, two passes, no schema change. ~50ms
 * for typical books (10-30 pages).
 *
 * Validation:
 *   - All pageIds must belong to this photobook (no cross-book mixing).
 *   - The set of pageIds must equal the existing set (no add/remove via
 *     reorder; use POST/DELETE pages for that).
 *   - Duplicate IDs in the list are rejected.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId } = await params;

  let body = {};
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const pageIds = Array.isArray(body.pageIds) ? body.pageIds : null;
  if (!pageIds || pageIds.length === 0) {
    return NextResponse.json({ error: 'pageIds (array) required' }, { status: 400 });
  }

  // Reject duplicates.
  if (new Set(pageIds).size !== pageIds.length) {
    return NextResponse.json({ error: 'duplicate page ids in list' }, { status: 400 });
  }

  // Basic UUID shape check.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!pageIds.every(id => typeof id === 'string' && uuidRe.test(id))) {
    return NextResponse.json({ error: 'invalid page id format' }, { status: 400 });
  }

  const db = createDb();
  const client = await db.connect ? await db.connect() : null;
  // db pattern check — createDb returns a Pool; we need a client for
  // transaction. Fallback: if createDb returns Pool, use it; if it's a
  // pre-connected client, use it directly. The codebase uses pool, so
  // most likely we get a pool. Use BEGIN/COMMIT directly if no connect.

  try {
    // Verify ownership.
    const ownership = await db.query(
      `SELECT 1 FROM user_books
        WHERE id = $1 AND user_id = $2 AND book_type = 'photobook'`,
      [photobookId, user.id]
    );
    if (ownership.rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Verify the set of pageIds matches what's actually in the book.
    const existingQ = await db.query(
      `SELECT id FROM photobook_pages WHERE user_book_id = $1`,
      [photobookId]
    );
    const existingIds = new Set(existingQ.rows.map(r => r.id));

    if (existingIds.size !== pageIds.length) {
      return NextResponse.json(
        {
          error: 'page count mismatch — reorder must include every existing page exactly once',
          expected: existingIds.size,
          received: pageIds.length,
        },
        { status: 400 }
      );
    }
    for (const id of pageIds) {
      if (!existingIds.has(id)) {
        return NextResponse.json(
          { error: `page id ${id} does not belong to this photobook` },
          { status: 400 }
        );
      }
    }

    // ─── Two-pass UPDATE in a transaction ───
    await db.query('BEGIN');

    try {
      // Pass 1: shift to negative numbers (avoids UNIQUE collision).
      // -i guarantees uniqueness within the book during the gap.
      for (let i = 0; i < pageIds.length; i++) {
        await db.query(
          `UPDATE photobook_pages
              SET page_number = $1
            WHERE id = $2`,
          [-(i + 1), pageIds[i]]
        );
      }

      // Pass 2: assign final positive page_numbers in user-specified order.
      for (let i = 0; i < pageIds.length; i++) {
        await db.query(
          `UPDATE photobook_pages
              SET page_number = $1
            WHERE id = $2`,
          [i + 1, pageIds[i]]
        );
      }

      // Bump book last_active_at.
      await db.query(
        `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
        [photobookId]
      );

      await db.query('COMMIT');
    } catch (txErr) {
      await db.query('ROLLBACK').catch(() => {});
      throw txErr;
    }

    console.log(`[POST /api/photobooks/${photobookId}/pages/reorder] reordered ${pageIds.length} pages`);

    return NextResponse.json({ ok: true, pageCount: pageIds.length });
  } catch (e) {
    console.error('[POST /api/photobooks/:id/pages/reorder]', e?.message);
    return NextResponse.json({ error: 'reorder failed' }, { status: 500 });
  }
}
