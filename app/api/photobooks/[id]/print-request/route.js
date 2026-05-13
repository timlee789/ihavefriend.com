/**
 * POST /api/photobooks/[id]/print-request
 *
 * Strategy: STRATEGY-photobook-r2-print-request-2026-05-07.md §4
 *
 * Flow:
 *   1. requireAuth + ownership (book_type='photobook')
 *   2. Validate body — recipient_name + shipping_address required
 *   3. Reject duplicates (any non-cancelled request for the same book)
 *   4. Fetch pages + photos + audio (same query as R1's /pdf endpoint)
 *   5. Generate PDF (R1's generatePhotobookPrintPdf — original-aware)
 *   6. INSERT print_requests row (status = 'submitted')
 *   7. Send email to ADMIN_EMAIL via Resend (best-effort; DB row stays
 *      even if Resend isn't configured or the send fails)
 *   8. Update email_sent_to_tim + email_sent_at on success
 *   9. Return { request: { id, status, created_at }, message }
 *
 * Tim's "모든 책 오더는 수동" 원칙. 베타엔 결제 없음.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { checkFeatureOrError } from '@/lib/quotas';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  // 🔥 Sprint 2V (2026-05-13) — Tim 결정 9-B: Lulu 인쇄 발주는 Premium 만.
  //   Trial (free tier) 는 사진책 작성 / 편집 / preview 가능 — 인쇄
  //   발주 (이 endpoint) 만 차단. 403 + ALLOW_BOOK_PRINT_NOT_ALLOWED.
  const printCheck = await checkFeatureOrError(user.id, 'allowBookPrint');
  if (!printCheck.ok) {
    return Response.json(printCheck.error, { status: 403 });
  }

  const { id: photobookId } = await params;
  if (!photobookId) {
    return Response.json({ error: 'photobook id required' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  // ── Required field validation ──
  const recipient_name   = String(body?.recipient_name   || '').trim();
  const shipping_address = String(body?.shipping_address || '').trim();
  if (!recipient_name) {
    return Response.json({ error: '받는 분 이름을 입력해 주세요' }, { status: 400 });
  }
  if (!shipping_address) {
    return Response.json({ error: '배송 주소를 입력해 주세요' }, { status: 400 });
  }

  const db = createDb();

  try {
    // ── Book ownership + metadata ──
    const bookRow = await db.query(
      `SELECT id, title, subtitle
         FROM user_books
        WHERE id = $1 AND user_id = $2 AND book_type = 'photobook'`,
      [photobookId, user.id]
    );
    if (bookRow.rows.length === 0) {
      return Response.json({ error: 'photobook not found' }, { status: 404 });
    }
    const photobook = bookRow.rows[0];

    // ── Pages + photos + audio (same shape R1's /pdf uses) ──
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
      return Response.json({ error: 'no pages to print' }, { status: 400 });
    }

    // ── Duplicate guard (any non-cancelled request blocks resubmit) ──
    const existing = await db.query(
      `SELECT id, status FROM print_requests
        WHERE user_book_id = $1
          AND user_id = $2
          AND status NOT IN ('cancelled')
        ORDER BY created_at DESC
        LIMIT 1`,
      [photobookId, user.id]
    );
    if (existing.rows.length > 0) {
      return Response.json(
        {
          error: '이 책은 이미 신청하셨어요',
          existing_request_id: existing.rows[0].id,
          existing_status:     existing.rows[0].status,
        },
        { status: 409 }
      );
    }

    // ── Generate PDF (R1's generator) ──
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
      `[POST print-request] generating PDF for photobook ${photobookId}, ${pages.length} pages...`
    );
    // Pattern matches /pdf route — require() inside the handler keeps
    // pdfkit out of the module-graph compile time.
    const { generatePhotobookPrintPdf } = require('@/lib/photobookPrintPdf');
    const pdfBuffer = await generatePhotobookPrintPdf({ photobook, pages });
    console.log(
      `[POST print-request] PDF generated, ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`
    );

    // ── INSERT print_requests row ──
    const insert = await db.query(
      `INSERT INTO print_requests
         (user_id, user_book_id,
          recipient_name, recipient_phone,
          shipping_address, shipping_city, shipping_state,
          shipping_postal, shipping_country,
          message_to_recipient,
          pdf_size_bytes, page_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, status, created_at`,
      [
        user.id,
        photobookId,
        recipient_name,
        body.recipient_phone || null,
        shipping_address,
        body.shipping_city  || null,
        body.shipping_state || null,
        body.shipping_postal || null,
        body.shipping_country || 'US',
        body.message_to_recipient || null,
        pdfBuffer.length,
        pages.length,
      ]
    );
    const printRequest = insert.rows[0];

    console.log(`[POST print-request] created request ${printRequest.id}`);

    // ── Email Tim (best-effort) ──
    // Lazy require so unconfigured Resend never blocks request creation.
    let emailResult = { ok: false, error: 'not attempted' };
    try {
      const { sendPrintRequestEmail } = require('@/lib/emailClient');
      emailResult = await sendPrintRequestEmail({
        request: {
          id: printRequest.id,
          recipient_name,
          recipient_phone:      body.recipient_phone,
          shipping_address,
          shipping_city:        body.shipping_city,
          shipping_state:       body.shipping_state,
          shipping_postal:      body.shipping_postal,
          shipping_country:     body.shipping_country || 'US',
          message_to_recipient: body.message_to_recipient,
          created_at:           printRequest.created_at,
        },
        book: {
          title:      photobook.title,
          subtitle:   photobook.subtitle,
          page_count: pages.length,
        },
        user: { id: user.id, email: user.email, name: user.name },
        pdfBuffer,
        pdfUrl: null, // 베타엔 R2 pre-signed URL 안 만듦 (첨부만 사용)
      });
    } catch (e) {
      console.error('[POST print-request] email helper threw:', e?.message);
      emailResult = { ok: false, error: e?.message };
    }

    if (emailResult.ok) {
      await db.query(
        `UPDATE print_requests
            SET email_sent_to_tim = TRUE,
                email_sent_at     = NOW()
          WHERE id = $1`,
        [printRequest.id]
      );
      console.log(`[POST print-request] email sent (resend id: ${emailResult.id})`);
    } else {
      // DB row exists; Tim can monitor print_requests directly as fallback.
      console.warn(`[POST print-request] email send failed: ${emailResult.error}`);
    }

    return Response.json({
      request: {
        id:         printRequest.id,
        status:     printRequest.status,
        created_at: printRequest.created_at,
      },
      message: '신청 완료. Tim 님이 검수 후 5–10일 안에 보내드립니다.',
    }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/photobooks/:id/print-request]', e?.message);
    return Response.json(
      { error: 'print request failed', detail: e?.message },
      { status: 500 }
    );
  }
}
