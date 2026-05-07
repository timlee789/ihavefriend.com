/**
 * GET /api/photobooks/[id]/pdf — print-quality PDF for a photobook.
 *
 * Strategy: STRATEGY-photobook-r1-print-pdf-2026-05-07.md §4
 *
 * Output:
 *   200 application/pdf
 *   Content-Disposition: inline (preview) | attachment (?download=true)
 *
 * Pipeline:
 *   1. requireAuth + ownership check (book_type='photobook' AND user_id)
 *   2. one query for pages + photos + audio (LEFT JOINs)
 *   3. shape rows → photobookPrintPdf input
 *   4. generatePhotobookPrintPdf(...) — original-photo-aware via R0
 *   5. stream the PDF Buffer back
 *
 * Vercel limit: maxDuration = 60s. Strategy §4.3 estimates 30 page ≈
 * 8-15s, 60 page ≈ 20-30s. R1c measures real numbers.
 *
 * Cache: private, no-store. PDF is regenerated on every call so
 * caption/photo edits show up immediately.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export const maxDuration = 60;

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId } = await params;
  if (!photobookId) {
    return new Response(JSON.stringify({ error: 'photobook id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const isDownload = url.searchParams.get('download') === 'true';

  const db = createDb();

  try {
    // ── Book metadata + ownership ──
    const bookRow = await db.query(
      `SELECT id, title, subtitle
         FROM user_books
        WHERE id = $1
          AND user_id = $2
          AND book_type = 'photobook'`,
      [photobookId, user.id]
    );
    if (bookRow.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const photobook = bookRow.rows[0];

    // ── Pages + photos + audio in a single query ──
    // LEFT JOINs because not every page has a photo or audio.
    // page_id is UNIQUE on both child tables, so this never multiplies rows.
    const pagesRow = await db.query(
      `SELECT
         p.id, p.page_number, p.page_title, p.caption,
         pp.id            AS photo_id,
         pp.r2_key,
         pp.r2_key_original,
         pp.width,
         pp.height,
         pp.original_width,
         pp.original_height,
         pa.public_token,
         pa.is_public
       FROM photobook_pages p
       LEFT JOIN photobook_page_photos pp ON pp.page_id = p.id
       LEFT JOIN photobook_page_audios pa ON pa.page_id = p.id
       WHERE p.user_book_id = $1
       ORDER BY p.page_number ASC`,
      [photobookId]
    );

    if (pagesRow.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'no pages to render' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── DB shape → generator shape ──
    const pages = pagesRow.rows.map(r => ({
      id:          r.id,
      page_number: r.page_number,
      page_title:  r.page_title,
      caption:     r.caption,
      photo: r.photo_id ? {
        id:              r.photo_id,
        r2_key:          r.r2_key,
        r2_key_original: r.r2_key_original,
        width:           r.width,
        height:          r.height,
        original_width:  r.original_width,
        original_height: r.original_height,
      } : null,
      audio: r.public_token ? {
        public_token: r.public_token,
        is_public:    r.is_public,
      } : null,
    }));

    console.log(
      `[GET /api/photobooks/${photobookId}/pdf] generating, ${pages.length} pages...`
    );
    const startTime = Date.now();
    // 🔥 Pattern from app/api/book/[id]/preview/route.js — require()
    // inside the handler keeps the bundler from resolving pdfkit's CJS
    // shape at module-graph compile time (PDFDocument is not a constructor).
    const { generatePhotobookPrintPdf } = require('@/lib/photobookPrintPdf');
    const pdfBuffer = await generatePhotobookPrintPdf({ photobook, pages });
    const elapsed = Date.now() - startTime;
    console.log(
      `[GET /api/photobooks/${photobookId}/pdf] done in ${elapsed}ms, ` +
      `${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB`
    );

    // Filename — strip non-printable + path-unsafe chars but keep KO.
    const safeTitle = (photobook.title || 'photobook')
      .replace(/[^\w\s가-힣-]/g, '_')
      .substring(0, 50);
    const disposition = isDownload ? 'attachment' : 'inline';

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(safeTitle)}.pdf"`,
        'Content-Length':      String(pdfBuffer.length),
        'Cache-Control':       'private, no-store',
      },
    });
  } catch (e) {
    console.error(`[GET /api/photobooks/${photobookId}/pdf]`, e?.message);
    return new Response(
      JSON.stringify({ error: 'pdf generation failed', detail: e?.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
