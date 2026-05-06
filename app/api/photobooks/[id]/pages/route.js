/**
 * POST /api/photobooks/[id]/pages  — append a new page to the photobook
 *
 * Photobook v3 Phase 1 (P2).
 *
 * Body: { page_title?, caption? }   (both optional — most pages start blank)
 * Response: { page: {...} }
 *
 * page_number is auto-assigned: MAX(page_number) + 1, starting at 1.
 * Photos and audio are attached separately via:
 *   POST /api/photobooks/[id]/pages/[pageId]/photo
 *   POST /api/photobooks/[id]/pages/[pageId]/audio
 *
 * Limit (beta): 100 pages per photobook. Tim's concern about "10 or 100
 * pages" surfaced during voice QR design — same caution applies here.
 * Easy to tune as a constant; no DB constraint needed.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

const MAX_PAGES_PER_PHOTOBOOK = 100;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId } = await params;

  if (!photobookId) {
    return NextResponse.json({ error: 'photobook id required' }, { status: 400 });
  }

  let body = {};
  try {
    if (request.headers.get('content-length') !== '0') {
      body = await request.json();
    }
  } catch { /* allow empty body */ }

  const pageTitle = typeof body.page_title === 'string'
    ? body.page_title.trim().slice(0, 200)
    : null;
  const caption = typeof body.caption === 'string'
    ? body.caption.trim().slice(0, 5000)
    : null;

  const db = createDb();

  try {
    // Verify ownership + book_type.
    const ownership = await db.query(
      `SELECT 1 FROM user_books
        WHERE id = $1 AND user_id = $2 AND book_type = 'photobook'`,
      [photobookId, user.id]
    );
    if (ownership.rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Page-count limit.
    const countQ = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM photobook_pages WHERE user_book_id = $1`,
      [photobookId]
    );
    const currentCount = countQ.rows[0]?.cnt || 0;
    if (currentCount >= MAX_PAGES_PER_PHOTOBOOK) {
      return NextResponse.json(
        {
          error: `Page limit reached (${MAX_PAGES_PER_PHOTOBOOK}). Start a new photobook for more.`,
          code: 'PHOTOBOOK_PAGE_LIMIT',
          max: MAX_PAGES_PER_PHOTOBOOK,
        },
        { status: 429 }
      );
    }

    // Determine next page_number.
    const orderQ = await db.query(
      `SELECT COALESCE(MAX(page_number), 0) + 1 AS next_num
         FROM photobook_pages
        WHERE user_book_id = $1`,
      [photobookId]
    );
    const nextNum = orderQ.rows[0]?.next_num || 1;

    // INSERT page.
    const result = await db.query(
      `INSERT INTO photobook_pages
         (user_book_id, page_number, page_title, caption)
       VALUES ($1, $2, $3, $4)
       RETURNING id, page_number, page_title, caption, caption_raw,
                 created_at, updated_at`,
      [photobookId, nextNum, pageTitle, caption]
    );
    const page = result.rows[0];

    // Bump the parent book's last_active_at so list ordering reflects activity.
    await db.query(
      `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
      [photobookId]
    );

    console.log(`[POST /api/photobooks/${photobookId}/pages] created page ${nextNum} (${currentCount + 1}/${MAX_PAGES_PER_PHOTOBOOK})`);

    return NextResponse.json(
      {
        page: {
          ...page,
          photo: null,
          audio: null,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    if (e?.code === '23505') {
      // page_number race condition — retry hint.
      return NextResponse.json(
        { error: 'concurrent page creation — please retry', code: 'RACE_CONDITION' },
        { status: 409 }
      );
    }
    console.error('[POST /api/photobooks/:id/pages]', e?.message);
    return NextResponse.json({ error: 'failed to create page' }, { status: 500 });
  }
}
