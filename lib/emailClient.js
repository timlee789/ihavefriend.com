/**
 * lib/emailClient.js — Resend 이메일 발송 helper.
 *
 * R2 (Print Request) 의 Tim 이메일 검수 흐름의 인프라.
 * 베타엔 print request 알림만 사용. 미래엔 사용자 알림
 * (배송 추적, 책 도착 등) 으로 확장 가능.
 *
 * 모든 발송은 try/catch + best-effort. 이메일 실패해도
 * print_requests row 는 정상 생성됨 (Tim 이 DB 직접 모니터링 fallback).
 *
 * Strategy: STRATEGY-photobook-r2-print-request-2026-05-07.md §3.3
 *
 * 환경변수 (Vercel + .env.local):
 *   RESEND_API_KEY   — Resend dashboard 의 API key
 *   ADMIN_EMAIL      — Tim 이 알림 받을 이메일 (default: tim@thecollegiategrill.com)
 */

const FROM_ADDRESS = 'SayAndKeep <orders@sayandkeep.com>';
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL || 'tim@thecollegiategrill.com';

let _resend = null;
let _resendInitFailed = false;

function getResend() {
  if (_resend) return _resend;
  if (_resendInitFailed) return null;
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emailClient] RESEND_API_KEY not set — print-request emails will not send');
    return null;
  }
  try {
    // Lazy require so the bundler doesn't pull resend into routes that
    // never email. Pattern matches the lazy require in pdfkit caller.
    const { Resend } = require('resend');
    _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
  } catch (e) {
    console.error('[emailClient] Resend init failed:', e?.message);
    _resendInitFailed = true;
    return null;
  }
}

/**
 * Send a print-request notification to Tim (admin).
 *
 * @param {Object} args
 * @param {Object} args.request    PrintRequest row (subset)
 * @param {Object} args.book       { title, subtitle, page_count }
 * @param {Object} args.user       { id, email, name }
 * @param {Buffer} args.pdfBuffer  PDF Buffer (attachment)
 * @param {string} [args.pdfUrl]   Optional R2 pre-signed URL (24h)
 * @returns {Promise<{ok: boolean, id?: string, error?: string}>}
 */
async function sendPrintRequestEmail({ request, book, user, pdfBuffer, pdfUrl }) {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'resend not configured' };
  }

  const subject = `[SayAndKeep] 인쇄 신청 — ${book.title} (${book.page_count}p)`;
  const html = renderPrintRequestEmailHtml({ request, book, user, pdfUrl });
  const text = renderPrintRequestEmailText({ request, book, user, pdfUrl });

  // PDF 첨부 — Resend 는 base64 받음.
  // filename 은 한글 + ASCII 만 허용, 50자 제한 (Lulu/Blurb 호환과 동일 정책).
  const safeFileName = `${
    (book.title || 'photobook').replace(/[^\w\s가-힣-]/g, '_').substring(0, 50)
  }.pdf`;

  try {
    const result = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      [ADMIN_EMAIL],
      reply_to: user.email,  // Tim 이 답장 누르면 사용자에게 직접 전달
      subject,
      html,
      text,
      attachments: pdfBuffer
        ? [{ filename: safeFileName, content: pdfBuffer.toString('base64') }]
        : [],
    });
    return { ok: true, id: result?.data?.id };
  } catch (e) {
    console.error('[emailClient] sendPrintRequestEmail failed:', e?.message);
    return { ok: false, error: e?.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// HTML / text body — Tim's review checklist embedded
// ─────────────────────────────────────────────────────────────────
function renderPrintRequestEmailHtml({ request, book, user, pdfUrl }) {
  const fmtDate = new Date(request.created_at).toLocaleString('ko-KR');
  return `
<!DOCTYPE html>
<html>
<body style="font-family: 'Helvetica', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1410;">
  <h1 style="color: #ea580c; font-size: 22px; margin: 0 0 16px;">📦 새 인쇄 신청</h1>

  <div style="background: #fff7ed; border-left: 4px solid #fb923c; padding: 16px; margin: 16px 0; border-radius: 4px;">
    <h2 style="margin: 0 0 8px; font-size: 18px;">${escapeHtml(book.title || '제목 없음')}</h2>
    ${book.subtitle ? `<div style="color: #666; margin-bottom: 8px;">${escapeHtml(book.subtitle)}</div>` : ''}
    <div style="color: #444; font-size: 14px;">
      ${book.page_count}페이지 · 8×8 inch hardcover
    </div>
  </div>

  <h3 style="margin-top: 24px; font-size: 16px; color: #444;">신청자</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 4px 0; color: #666; width: 100px;">이름</td><td><strong>${escapeHtml(user.name || '')}</strong></td></tr>
    <tr><td style="padding: 4px 0; color: #666;">이메일</td><td>${escapeHtml(user.email || '')}</td></tr>
    <tr><td style="padding: 4px 0; color: #666;">User ID</td><td>${user.id}</td></tr>
  </table>

  <h3 style="margin-top: 24px; font-size: 16px; color: #444;">받는 분 / 배송지</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 4px 0; color: #666; width: 100px;">받는 분</td><td><strong>${escapeHtml(request.recipient_name)}</strong></td></tr>
    ${request.recipient_phone ? `<tr><td style="padding: 4px 0; color: #666;">전화</td><td>${escapeHtml(request.recipient_phone)}</td></tr>` : ''}
    <tr><td style="padding: 4px 0; color: #666; vertical-align: top;">주소</td><td>
      ${escapeHtml(request.shipping_address)}<br>
      ${request.shipping_city ? escapeHtml(request.shipping_city) + ', ' : ''}
      ${request.shipping_state ? escapeHtml(request.shipping_state) + ' ' : ''}
      ${request.shipping_postal ? escapeHtml(request.shipping_postal) : ''}<br>
      ${escapeHtml(request.shipping_country || 'US')}
    </td></tr>
  </table>

  ${request.message_to_recipient ? `
  <h3 style="margin-top: 24px; font-size: 16px; color: #444;">받는 분에게 한 마디</h3>
  <div style="background: #f9f9f9; padding: 12px; border-radius: 6px; font-style: italic;">
    "${escapeHtml(request.message_to_recipient)}"
  </div>
  ` : ''}

  <h3 style="margin-top: 24px; font-size: 16px; color: #444;">PDF</h3>
  <p>📎 PDF 가 이 이메일에 첨부되어 있습니다.</p>
  ${pdfUrl ? `<p>또는 R2 에서 직접 보기:<br><a href="${pdfUrl}" style="color: #ea580c;">${pdfUrl}</a><br><small style="color: #888;">(24시간 유효)</small></p>` : ''}

  <h3 style="margin-top: 24px; font-size: 16px; color: #444;">검수 후 할 일</h3>
  <ol style="line-height: 1.8;">
    <li>PDF 검수 (사진 해상도, 캡션, QR 작동)</li>
    <li>Lulu (또는 Blurb) 사이트에 PDF 업로드 + 발주</li>
    <li>주소: 위 받는 분 정보로 배송 설정</li>
    <li>DB 의 print_requests 에서 status 업데이트:<br>
      <code style="background: #f0f0f0; padding: 2px 6px; font-size: 12px;">UPDATE print_requests SET status='ordered', vendor='lulu', vendor_order_id='LU-12345', cost_usd=37.50 WHERE id='${request.id}';</code>
    </li>
  </ol>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #ddd;">
  <p style="color: #999; font-size: 12px;">
    SayAndKeep · Print Request <code>${request.id}</code><br>
    신청 시간: ${fmtDate}
  </p>
</body>
</html>
  `.trim();
}

function renderPrintRequestEmailText({ request, book, user, pdfUrl }) {
  const fmtDate = new Date(request.created_at).toLocaleString('ko-KR');
  return [
    '[SayAndKeep] 새 인쇄 신청',
    '',
    `책: ${book.title || '제목 없음'}`,
    book.subtitle ? `부제: ${book.subtitle}` : '',
    `페이지: ${book.page_count}p · 8×8 inch hardcover`,
    '',
    '== 신청자 ==',
    `이름: ${user.name || ''}`,
    `이메일: ${user.email || ''}`,
    `User ID: ${user.id}`,
    '',
    '== 받는 분 / 배송지 ==',
    `받는 분: ${request.recipient_name}`,
    request.recipient_phone ? `전화: ${request.recipient_phone}` : '',
    '주소:',
    `  ${request.shipping_address}`,
    `  ${[request.shipping_city, request.shipping_state, request.shipping_postal].filter(Boolean).join(', ')}`,
    `  ${request.shipping_country || 'US'}`,
    '',
    request.message_to_recipient
      ? `== 받는 분에게 한 마디 ==\n"${request.message_to_recipient}"\n`
      : '',
    '== PDF ==',
    '첨부 파일을 확인해 주세요.',
    pdfUrl ? `또는: ${pdfUrl} (24h)` : '',
    '',
    '== 검수 후 할 일 ==',
    '1. PDF 검수',
    '2. Lulu/Blurb 에 업로드 + 발주',
    '3. 위 받는 분 주소로 배송 설정',
    '4. DB 업데이트:',
    `   UPDATE print_requests SET status='ordered', vendor='lulu',`,
    `     vendor_order_id='LU-12345', cost_usd=37.50`,
    `   WHERE id='${request.id}';`,
    '',
    `Print Request: ${request.id}`,
    `신청 시간: ${fmtDate}`,
  ].filter(Boolean).join('\n');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { sendPrintRequestEmail };
