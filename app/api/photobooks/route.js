/**
 * GET  /api/photobooks  — list current user's photobooks
 * POST /api/photobooks  — create a new photobook
 *
 * Photobook v3 Phase 1 (P2). See:
 *   STRATEGY-photobook-expansion-v3-2026-05-06.md §4
 *
 * Photobooks are stored in user_books with book_type='photobook'.
 * Memoir/essay books continue to live in the same table with
 * book_type='memoir' (the existing default). The /api/photobooks/*
 * endpoints filter to book_type='photobook' so they never see or touch
 * memoir books, even though both share the table.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { checkQuotaOrError } from '@/lib/quotas';

// ─────────────────────────────────────────────────────────────────
// GET — list user's photobooks
// ─────────────────────────────────────────────────────────────────
// Returns: { photobooks: [{ id, title, subtitle, started_at,
//                            last_active_at, page_count, cover_photo_url }, ...] }
// page_count + cover_photo_url are computed for the list UI thumbnails;
// no need to fetch full photobook data.
//
// 🔥 Schema note: user_books uses `subtitle` and `last_active_at`
// (carried over from the memoir flow). We expose them under those
// names so the photobook frontend can use one consistent shape.
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();

  try {
    // Sub-query for page count + cover photo (first page's photo).
    // Cover photo: photobook_page_photos joined to photobook_pages
    // ordered by page_number ASC, take first.
    const result = await db.query(
      `SELECT
         b.id,
         b.title,
         b.subtitle,
         b.book_type,
         b.started_at,
         b.last_active_at,
         COALESCE(
           (SELECT COUNT(*)::int
              FROM photobook_pages p
             WHERE p.user_book_id = b.id),
           0
         ) AS page_count,
         (SELECT pp.id
            FROM photobook_pages p
            JOIN photobook_page_photos pp ON pp.page_id = p.id
           WHERE p.user_book_id = b.id
           ORDER BY p.page_number ASC
           LIMIT 1
         ) AS cover_photo_id
       FROM user_books b
      WHERE b.user_id   = $1
        AND b.book_type = 'photobook'
      ORDER BY b.last_active_at DESC NULLS LAST`,
      [user.id]
    );

    return NextResponse.json({ photobooks: result.rows });
  } catch (e) {
    console.error('[GET /api/photobooks]', e?.message);
    return NextResponse.json({ error: 'failed to load photobooks' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// POST — create a new photobook
// ─────────────────────────────────────────────────────────────────
// Body: { title, subtitle? }
// Title is required; subtitle is optional and defaults to ''.
// We do NOT auto-create a first page here — the editor creates page 1
// when the user takes their first action. This keeps the initial create
// flow simple and avoids orphaned empty pages if the user bails.
//
// `structure` is NOT NULL on user_books (memoir flow uses it for chapter
// trees). Photobooks don't use it; we INSERT '{}' so the constraint is
// satisfied without leaking memoir concepts into the photobook flow.
//
// `status='active'` matches the memoir convention — keeps the row
// visible to any cross-cutting query that filters by status.
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body = {};
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const title = String(body.title || '').trim();
  // Frontend / API may send either `subtitle` (column-aligned) or
  // `description` (early P2 docs); accept both, prefer `subtitle`.
  const subtitle = String(body.subtitle ?? body.description ?? '').trim();

  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: 'title too long (max 200 chars)' }, { status: 400 });
  }
  if (subtitle.length > 2000) {
    return NextResponse.json({ error: 'subtitle too long (max 2000 chars)' }, { status: 400 });
  }

  const db = createDb();

  // 🔥 Sprint 2j (2026-05-11) — maxBooks quota (per kind). Count user's
  //   existing photobooks; bail with 403 if at limit.
  const cntRes = await db.query(
    `SELECT COUNT(*)::int AS n FROM user_books
      WHERE user_id = $1 AND book_type = 'photobook'`,
    [user.id]
  );
  const cnt = cntRes.rows[0]?.n || 0;
  const check = await checkQuotaOrError(user.id, 'maxBooks', cnt);
  if (!check.ok) {
    return NextResponse.json(check.error, { status: 403 });
  }

  try {
    const result = await db.query(
      `INSERT INTO user_books (user_id, title, subtitle, book_type, status, structure)
       VALUES ($1, $2, $3, 'photobook', 'active', '{}'::jsonb)
       RETURNING id, title, subtitle, book_type, started_at, last_active_at`,
      [user.id, title, subtitle]
    );
    const photobook = result.rows[0];
    console.log(`[POST /api/photobooks] created id=${photobook.id} user=${user.id} title="${title}"`);
    return NextResponse.json({ photobook }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/photobooks]', e?.message);
    return NextResponse.json({ error: 'failed to create photobook' }, { status: 500 });
  }
}
