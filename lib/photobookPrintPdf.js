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
// ─────────────────────────────────────────────────────────────────
function renderPage(doc, page, photoBuffer, qrBuffer, regularFont, boldFont) {
  // ── Header — page number, small + soft ──
  doc.font(regularFont).fontSize(9).fillColor('#aaa');
  doc.text(
    `${page.page_number}쪽`,
    PAGE.contentLeft,
    PAGE.contentTop,
    {
      width: PAGE.contentWidth,
      align: 'left',
    }
  );
  doc.fillColor('#000');

  // ── Photo area — contain fit, centered ──
  const PHOTO_BOX_Y      = PAGE.contentTop + 25;                          // ~70
  const PHOTO_BOX_HEIGHT = Math.floor(PAGE.contentHeight * 0.55);          // ~280
  const PHOTO_BOX_WIDTH  = PAGE.contentWidth;

  if (photoBuffer) {
    try {
      doc.image(photoBuffer, PAGE.contentLeft, PHOTO_BOX_Y, {
        fit:    [PHOTO_BOX_WIDTH, PHOTO_BOX_HEIGHT],
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

  // Track the cursor for text below the photo box. PDFKit's `doc.y`
  // doesn't always advance after an image with explicit coordinates,
  // so we set it manually.
  let textY = PHOTO_BOX_Y + PHOTO_BOX_HEIGHT + 16;

  // ── Page title (optional) ──
  if (page.page_title) {
    doc.font(boldFont).fontSize(16).fillColor('#1a1410');
    doc.text(page.page_title, PAGE.contentLeft, textY, {
      width: PAGE.contentWidth,
      align: 'left',
      lineGap: 2,
    });
    textY = doc.y + 8;
  }

  // ── Caption ──
  if (page.caption) {
    doc.font(regularFont).fontSize(11).fillColor('#222');
    doc.text(page.caption, PAGE.contentLeft, textY, {
      width: PAGE.contentWidth,
      align: 'left',
      lineGap: 3,
      // Long captions can overflow the safe zone; the beta accepts
      // this trade-off (no auto page-split). Truncating client-side
      // is a future Phase 4+ refinement.
    });
  }

  // ── QR code (bottom-right) — only when audio shared ──
  if (qrBuffer) {
    const QR_SIZE = 70;
    const QR_X    = PAGE.contentRight - QR_SIZE;
    // Reserve 18pt below the QR for its label.
    const QR_Y    = PAGE.contentBottom - QR_SIZE - 18;

    try {
      doc.image(qrBuffer, QR_X, QR_Y, { width: QR_SIZE, height: QR_SIZE });
      doc.font(regularFont).fontSize(7).fillColor('#666');
      doc.text(
        '🎤 음성 듣기',
        QR_X,
        QR_Y + QR_SIZE + 3,
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
