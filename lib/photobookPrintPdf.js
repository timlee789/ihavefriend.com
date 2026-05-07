/**
 * lib/photobookPrintPdf.js — render a Photobook to a print-ready PDF Buffer.
 *
 * Strategy: STRATEGY-photobook-r1-print-pdf-2026-05-07.md (Tim 2026-05-07)
 *
 * Output spec — Lulu / Blurb hardcover photo book compatible:
 *   - Final PDF size: 8.25 × 8.25 inch (594 × 594 pt)
 *     = 8 × 8 inch trim + 0.125" bleed on every side
 *   - Safe zone: 0.5 inch from trim line (= 45 pt from PDF edge)
 *   - PDF version 1.4 (PDF/X-3 minimum)
 *   - Embedded Noto Sans KR (Regular + Bold) for Korean glyphs
 *
 * Layout (every page identical except cover):
 *   ┌─ 8.25 × 8.25 ──────────────────┐
 *   │  [bleed 0.125"]                │
 *   │  ┌─ trim 8 × 8 ───────────────┐│
 *   │  │ {page_number}쪽           ││ ← header (small)
 *   │  │  ┌──────────────────┐     ││
 *   │  │  │   [photo, fit]   │     ││ ← ~55% of content height
 *   │  │  └──────────────────┘     ││
 *   │  │  page title (16pt Bold)   ││
 *   │  │  caption text (11pt)      ││
 *   │  │                  ┌──┐     ││
 *   │  │                  │QR│     ││ ← bottom-right when audio is_public
 *   │  │                  └──┘     ││
 *   │  └───────────────────────────┘│
 *   └────────────────────────────────┘
 *
 * Photo source — R0 fallback chain:
 *   r2_key_original (4096px JPEG, 95%)   ← preferred for print quality
 *   r2_key          (1920px JPEG, 80%)   ← fallback for legacy rows
 *
 * Pattern reference: lib/bookPdf.js (memoir PDF) — shares fonts,
 * QR helper, page-buffer pattern. The differences (size, layout,
 * single-template, R2 fetch via S3 client) live in this file.
 */

// PDFKit + QRCode CJS imports. Some bundler configs (Turbopack interop)
// occasionally hand back the module's namespace object instead of the
// default export — fall back to .default in that case so `new PDFDocument(...)`
// always finds the constructor. bookPdf.js predates this fix; left as-is
// since it works in production today.
const _pdfkit  = require('pdfkit');
const PDFDocument = _pdfkit && _pdfkit.default ? _pdfkit.default : _pdfkit;
const _qrcode = require('qrcode');
const QRCode  = _qrcode && _qrcode.default ? _qrcode.default : _qrcode;
const fs          = require('fs');
const path        = require('path');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getR2Client, getR2Bucket } = require('./r2Client');

const REGULAR_FONT_FILE = 'NotoSansKR-Regular.otf';
const BOLD_FONT_FILE    = 'NotoSansKR-Bold.otf';

// Public listen URL base — used to encode the QR target. Matches the
// bookPdf.js convention so a printed photobook always links to the
// live site regardless of which env (dev/preview/prod) generated it.
const LISTEN_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sayandkeep.com';

// ─────────────────────────────────────────────────────────────────
// Page geometry — 8.25 × 8.25 inch (8" trim + 0.125" bleed on each side)
// 1 inch = 72 pt.
// ─────────────────────────────────────────────────────────────────
const PAGE = {
  width:  594,                  // 8.25 in
  height: 594,                  // 8.25 in
  bleed:  9,                    // 0.125 in
  // Safe zone — text/photo must stay inside this rectangle.
  contentLeft:    45,           // bleed (9) + safeMargin (36)
  contentTop:     45,
  contentRight:   549,          // 594 - 45
  contentBottom:  549,
  contentWidth:   504,          // 549 - 45
  contentHeight:  504,
};

// ─────────────────────────────────────────────────────────────────
// registerFonts — Noto Sans KR (Regular + Bold). Matches bookPdf.js.
// ─────────────────────────────────────────────────────────────────
function registerFonts(doc) {
  const fontDir   = path.join(process.cwd(), 'public', 'fonts');
  const regPath   = path.join(fontDir, REGULAR_FONT_FILE);
  const boldPath  = path.join(fontDir, BOLD_FONT_FILE);
  let regularFont = 'Helvetica';
  let boldFont    = 'Helvetica-Bold';

  if (fs.existsSync(regPath)) {
    doc.registerFont('NotoKR', regPath);
    regularFont = 'NotoKR';
  } else {
    console.warn(`[photobookPrintPdf] missing ${REGULAR_FONT_FILE}; Korean will not render`);
  }
  if (fs.existsSync(boldPath)) {
    doc.registerFont('NotoKR-Bold', boldPath);
    boldFont = 'NotoKR-Bold';
  } else {
    console.warn(`[photobookPrintPdf] missing ${BOLD_FONT_FILE}; Korean bold falls back to regular`);
    boldFont = regularFont;
  }
  return { regularFont, boldFont };
}

// ─────────────────────────────────────────────────────────────────
// prefetchPhotoBuffers — pull photos from R2 in parallel.
//
// Uses the AWS SDK GetObject directly (R0 reuse) instead of the public
// pub-*.r2.dev URL: keeps R2 credentials server-side and dodges the
// SafeBrowsing dev-URL block we already documented for audio.
//
// 🔥 R0 fallback chain — original first, compressed if missing.
// ─────────────────────────────────────────────────────────────────
async function prefetchPhotoBuffers(pages) {
  const targets = (pages || [])
    .filter(p => p?.photo)
    .map(p => p.photo);

  const out = new Map();
  if (targets.length === 0) return out;

  const client = getR2Client();
  const bucket = getR2Bucket();

  await Promise.all(targets.map(async (photo) => {
    const key = photo.r2_key_original || photo.r2_key;
    if (!key) return;
    const isOriginal = !!photo.r2_key_original;

    try {
      const res = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
      const buf = Buffer.from(await res.Body.transformToByteArray());
      out.set(photo.id, buf);
      console.log(
        `[photobookPrintPdf] photo ${photo.id} ` +
        `(${isOriginal ? 'ORIGINAL' : 'compressed'}) ${buf.length}b`
      );
    } catch (e) {
      console.warn(
        `[photobookPrintPdf] photo fetch failed (${key}):`,
        e?.message
      );
      // best-effort — leave this photo absent. PDF still generates,
      // the page just renders without an image.
    }
  }));

  console.log(`[photobookPrintPdf] prefetched ${out.size}/${targets.length} photo(s)`);
  return out;
}

// ─────────────────────────────────────────────────────────────────
// prefetchAudioQrBuffers — same shape as bookPdf.js, adapted to the
// photobook page structure (one audio per page, no chapter nesting).
// ─────────────────────────────────────────────────────────────────
async function prefetchAudioQrBuffers(pages) {
  const targets = (pages || [])
    .filter(p => p?.audio?.public_token && p.audio.is_public !== false)
    .map(p => p.audio);

  const out = new Map();
  if (targets.length === 0) return out;

  await Promise.all(targets.map(async (audio) => {
    const url = `${LISTEN_BASE_URL.replace(/\/$/, '')}/listen/${audio.public_token}`;
    try {
      const buf = await QRCode.toBuffer(url, {
        type: 'png',
        width: 220, // ~70pt @ 96 DPI display, plenty for print
        margin: 2,
        color: { dark: '#1a1a1a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      out.set(audio.public_token, buf);
    } catch (e) {
      console.warn(
        `[photobookPrintPdf] QR generation failed for token ${audio.public_token}:`,
        e?.message
      );
    }
  }));

  console.log(`[photobookPrintPdf] prefetched ${out.size}/${targets.length} QR code(s)`);
  return out;
}

// ─────────────────────────────────────────────────────────────────
// renderCover — page 1 of the PDF (no addPage, just draws on the
// document's first page that PDFDocument creates implicitly).
// ─────────────────────────────────────────────────────────────────
function renderCover(doc, photobook, regularFont, boldFont) {
  const H = PAGE.height;

  // Title (28pt Bold, centered)
  doc.font(boldFont).fontSize(28).fillColor('#1a1410');
  doc.text(
    photobook.title || '제목 없음',
    PAGE.contentLeft,
    H * 0.35,
    {
      width: PAGE.contentWidth,
      align: 'center',
    }
  );

  // Subtitle (14pt Regular) — only if present
  if (photobook.subtitle) {
    doc.font(regularFont).fontSize(14).fillColor('#444');
    doc.text(
      photobook.subtitle,
      PAGE.contentLeft,
      H * 0.45,
      { width: PAGE.contentWidth, align: 'center' }
    );
  }

  // Date (10pt, soft grey, near the bottom)
  const dateStr = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.font(regularFont).fontSize(10).fillColor('#888');
  doc.text(dateStr, PAGE.contentLeft, H - 80, {
    width: PAGE.contentWidth, align: 'center',
  });

  // Brand footer
  doc.fontSize(9);
  doc.text('SayAndKeep', PAGE.contentLeft, H - 50, {
    width: PAGE.contentWidth, align: 'center',
  });

  doc.fillColor('#000');
}

// ─────────────────────────────────────────────────────────────────
// renderPage — one photobook page. All pages share this template.
//
// 🔥 R1.1 (Tim 2026-05-07) — photo-driven layout. The original R1
// gave the photo only ~55% of the page; the page felt like "text
// with a picture in it" instead of a real photo book. The new
// layout makes the photo dominant (≥75%) and pushes caption + QR
// onto a single row beneath it.
//
// Two patterns share the same code path:
//   A) caption ≤ 80 chars → photo 380pt + 1-2 line caption row + QR
//   B) caption > 80 chars → photo 320pt + multi-line caption + QR
//
// Threshold is char-count rather than measured-text-height because
// PDFKit's CJK line-wrap math can over-count by ~15% on Korean —
// safer to under-promise photo size than to over-promise and have
// the caption clip.
// ─────────────────────────────────────────────────────────────────
function renderPage(doc, page, photoBuffer, qrBuffer, regularFont, boldFont) {
  // ── Layout constants ──
  const HEADER_FONT_SIZE  = 8;
  const HEADER_COLOR      = '#bbb';
  const HEADER_HEIGHT     = 18;
  const HEADER_GAP        = 8;

  const CAPTION_THRESHOLD_CHARS = 80;
  const isLongCaption =
    (page.caption || '').length > CAPTION_THRESHOLD_CHARS;
  const PHOTO_HEIGHT  = isLongCaption ? 320 : 380;

  const GAP_AFTER_PHOTO = 14;
  const QR_SIZE         = 50;        // was 70; reduces visual weight
  const QR_GAP          = 12;        // horizontal gap between caption block and QR
  const TEXT_GAP_QR     = 4;         // align caption first line ~4pt below QR top

  const TITLE_FONT_SIZE   = 12;      // was 16; caption itself usually carries the meaning
  const TITLE_COLOR       = '#1a1410';
  const CAPTION_FONT_SIZE = 11;
  const CAPTION_COLOR     = '#222';
  const QR_LABEL_SIZE     = 6;       // was 7
  const QR_LABEL_COLOR    = '#888';

  // ── Coordinates ──
  const PHOTO_Y      = PAGE.contentTop + HEADER_HEIGHT + HEADER_GAP;
  const TEXT_Y       = PHOTO_Y + PHOTO_HEIGHT + GAP_AFTER_PHOTO;
  // When QR is present, reserve room on the right; otherwise caption
  // can use the full content width.
  const TEXT_WIDTH_WITH_QR = PAGE.contentWidth - QR_SIZE - QR_GAP; // 442
  const TEXT_WIDTH_FULL    = PAGE.contentWidth;                    // 504
  const QR_X         = PAGE.contentRight - QR_SIZE;
  const QR_Y         = TEXT_Y - TEXT_GAP_QR;

  const captionWidth = qrBuffer ? TEXT_WIDTH_WITH_QR : TEXT_WIDTH_FULL;

  // ── Header (page number) ──
  doc.font(regularFont).fontSize(HEADER_FONT_SIZE).fillColor(HEADER_COLOR);
  doc.text(
    `${page.page_number}쪽`,
    PAGE.contentLeft,
    PAGE.contentTop,
    { width: PAGE.contentWidth, align: 'left' }
  );
  doc.fillColor('#000');

  // ── Photo (dominant — 75% of content height in pattern A) ──
  if (photoBuffer) {
    try {
      doc.image(photoBuffer, PAGE.contentLeft, PHOTO_Y, {
        fit:    [PAGE.contentWidth, PHOTO_HEIGHT],
        align:  'center',
        valign: 'center',
      });
    } catch (e) {
      console.warn(
        `[photobookPrintPdf] photo embed failed page ${page.page_number}:`,
        e?.message
      );
    }
  }

  // ── Text block — page_title (optional) + caption ──
  // Cursor walks down so an optional title sits above the caption.
  let cursorY = TEXT_Y;

  if (page.page_title) {
    doc.font(boldFont).fontSize(TITLE_FONT_SIZE).fillColor(TITLE_COLOR);
    doc.text(page.page_title, PAGE.contentLeft, cursorY, {
      width: captionWidth,
      align: 'left',
      lineGap: 1,
    });
    cursorY = doc.y + 4;
  }

  if (page.caption) {
    doc.font(regularFont).fontSize(CAPTION_FONT_SIZE).fillColor(CAPTION_COLOR);
    doc.text(page.caption, PAGE.contentLeft, cursorY, {
      width: captionWidth,
      align: 'left',
      lineGap: 2,
      // Captions longer than ~10 lines may clip below the safe zone
      // even with pattern B's smaller photo. Beta-acceptable; future
      // Phase 4+ can auto-split or warn the user in the editor.
    });
  }

  // ── QR (right-side, aligned with the caption row, smaller) ──
  if (qrBuffer) {
    try {
      doc.image(qrBuffer, QR_X, QR_Y, { width: QR_SIZE, height: QR_SIZE });
      doc.font(regularFont).fontSize(QR_LABEL_SIZE).fillColor(QR_LABEL_COLOR);
      doc.text(
        '음성 듣기',
        QR_X,
        QR_Y + QR_SIZE + 2,
        { width: QR_SIZE, align: 'center' }
      );
    } catch (e) {
      console.warn(
        `[photobookPrintPdf] QR embed failed page ${page.page_number}:`,
        e?.message
      );
    }
  }

  doc.fillColor('#000');
}

// ─────────────────────────────────────────────────────────────────
// generatePhotobookPrintPdf — orchestrator.
//
// Returns Promise<Buffer> matching bookPdf.js's generatePdfBuffer.
// ─────────────────────────────────────────────────────────────────
async function generatePhotobookPrintPdf({ photobook, pages }) {
  if (!photobook) throw new Error('photobook required');
  if (!Array.isArray(pages)) throw new Error('pages must be an array');

  // Pre-fetch in parallel before the sync render loop.
  const [photoBuffers, qrBuffers] = await Promise.all([
    prefetchPhotoBuffers(pages),
    prefetchAudioQrBuffers(pages),
  ]);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [PAGE.width, PAGE.height],
        margins: {
          top:    PAGE.contentTop,
          bottom: PAGE.height - PAGE.contentBottom,
          left:   PAGE.contentLeft,
          right:  PAGE.width - PAGE.contentRight,
        },
        bufferPages: true,
        pdfVersion: '1.4',
        info: {
          Title:    photobook.title || 'Photobook',
          Author:   'SayAndKeep',
          Creator:  'SayAndKeep Photobook Generator',
          Subject:  'Photo Book',
          Keywords: 'photobook, sayandkeep, print',
        },
      });

      const { regularFont, boldFont } = registerFonts(doc);

      const buffers = [];
      doc.on('data',  buffers.push.bind(buffers));
      doc.on('end',   () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // ── Cover (PDFKit creates page 0 implicitly) ──
      renderCover(doc, photobook, regularFont, boldFont);

      // ── Pages ──
      for (const page of (pages || [])) {
        if (!page) continue;
        // Skip fully-empty pages — would produce blank prints the user
        // didn't intend. (page_number alone with no content is empty.)
        if (!page.photo && !page.caption && !page.page_title) {
          console.warn(
            `[photobookPrintPdf] skipping empty page ${page.page_number}`
          );
          continue;
        }
        doc.addPage();
        renderPage(
          doc,
          page,
          page.photo  ? photoBuffers.get(page.photo.id)            : null,
          page.audio  ? qrBuffers.get(page.audio.public_token)     : null,
          regularFont,
          boldFont
        );
      }

      // (No footer page-numbers pass — photobook pages already render
      // their own "{n}쪽" header. Cover stays unnumbered.)

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generatePhotobookPrintPdf };
