#!/usr/bin/env node
/**
 * scripts/test-photobook-pdf-r1.1-direct.js
 *
 * Variant of test-photobook-pdf-r1.1.js that skips the cover so each
 * scenario's CONTENT page sits at PDF page index 0 — that way
 * `qlmanage -t` thumbnails the layout (the cover would otherwise win).
 *
 * Reuses lib/photobookPrintPdf.js's internals via require('../lib/...')
 * but builds the PDFDocument ourselves so we control the page count.
 *
 * NOTE: this uses internal helpers (registerFonts, renderPage) which
 * are not exported. We re-implement the small registerFonts call
 * inline so we don't need to change the module's public surface.
 */

const path = require('path');
const fs   = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const FIXTURE_PHOTO_PATH = path.join(__dirname, '..', 'public', 'icons', 'emma-192.png');
const fakeBuffer = fs.readFileSync(FIXTURE_PHOTO_PATH);

// Stub R2 — same trick as the broader fixture.
const { S3Client } = require('@aws-sdk/client-s3');
S3Client.prototype.send = async function () {
  return { Body: { transformToByteArray: async () => new Uint8Array(fakeBuffer) } };
};

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

// Pull internals from the public module via a require + eval-friendly
// path: easiest is to call the orchestrator and have it produce a
// 1-content-page PDF, then drop the cover via a custom shim.
//
// Simpler approach: temporarily monkey-patch generatePhotobookPrintPdf
// to skip renderCover. We copy its source, remove that call, and
// require the rest. But that's brittle.
//
// Cleanest: use the module's `renderPage` indirectly by building our
// own PDF and calling generatePhotobookPrintPdf on a fixture where
// we hide the cover via post-processing. PDFKit doesn't easily delete
// a page after the fact, so instead we use `pdf-lib` if available,
// else fall back to "the cover IS the first thumbnail; the second page
// content shows up only when manually scrolling".
//
// SIMPLEST: ship a small helper that re-creates the renderPage by
// inlining the layout constants. That keeps the test independent
// without touching the lib file. The lib file has the source of truth;
// this is just a visualization aid.

// ── Page geometry (mirrors lib/photobookPrintPdf.js) ──
const PAGE = {
  width:  594, height: 594,
  bleed:  9,
  contentLeft:   45, contentTop:    45,
  contentRight:  549, contentBottom: 549,
  contentWidth:  504, contentHeight: 504,
};

const REGULAR_FONT_FILE = 'NotoSansKR-Regular.otf';
const BOLD_FONT_FILE    = 'NotoSansKR-Bold.otf';
const LISTEN_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sayandkeep.com';

function registerFonts(doc) {
  const fontDir   = path.join(__dirname, '..', 'public', 'fonts');
  const regPath   = path.join(fontDir, REGULAR_FONT_FILE);
  const boldPath  = path.join(fontDir, BOLD_FONT_FILE);
  let regularFont = 'Helvetica';
  let boldFont    = 'Helvetica-Bold';
  if (fs.existsSync(regPath)) {
    doc.registerFont('NotoKR', regPath);
    regularFont = 'NotoKR';
  }
  if (fs.existsSync(boldPath)) {
    doc.registerFont('NotoKR-Bold', boldPath);
    boldFont = 'NotoKR-Bold';
  } else {
    boldFont = regularFont;
  }
  return { regularFont, boldFont };
}

// Inline copy of renderPage from lib/photobookPrintPdf.js.
// IMPORTANT: keep this in sync with the lib version. This script
// is for visual verification only — it should match what
// generatePhotobookPrintPdf produces for a single content page.
function renderPage(doc, page, photoBuffer, qrBuffer, regularFont, boldFont) {
  const HEADER_FONT_SIZE  = 8;
  const HEADER_COLOR      = '#bbb';
  const HEADER_HEIGHT     = 18;
  const HEADER_GAP        = 8;

  const CAPTION_THRESHOLD_CHARS = 80;
  const isLongCaption =
    (page.caption || '').length > CAPTION_THRESHOLD_CHARS;
  const PHOTO_HEIGHT  = isLongCaption ? 320 : 380;

  const GAP_AFTER_PHOTO = 14;
  const QR_SIZE         = 50;
  const QR_GAP          = 12;
  const TEXT_GAP_QR     = 4;

  const TITLE_FONT_SIZE   = 12;
  const TITLE_COLOR       = '#1a1410';
  const CAPTION_FONT_SIZE = 11;
  const CAPTION_COLOR     = '#222';
  const QR_LABEL_SIZE     = 6;
  const QR_LABEL_COLOR    = '#888';

  const PHOTO_Y      = PAGE.contentTop + HEADER_HEIGHT + HEADER_GAP;
  const TEXT_Y       = PHOTO_Y + PHOTO_HEIGHT + GAP_AFTER_PHOTO;
  const TEXT_WIDTH_WITH_QR = PAGE.contentWidth - QR_SIZE - QR_GAP;
  const TEXT_WIDTH_FULL    = PAGE.contentWidth;
  const QR_X         = PAGE.contentRight - QR_SIZE;
  const QR_Y         = TEXT_Y - TEXT_GAP_QR;

  const captionWidth = qrBuffer ? TEXT_WIDTH_WITH_QR : TEXT_WIDTH_FULL;

  doc.font(regularFont).fontSize(HEADER_FONT_SIZE).fillColor(HEADER_COLOR);
  doc.text(`${page.page_number}쪽`, PAGE.contentLeft, PAGE.contentTop,
    { width: PAGE.contentWidth, align: 'left' });
  doc.fillColor('#000');

  if (photoBuffer) {
    doc.image(photoBuffer, PAGE.contentLeft, PHOTO_Y, {
      fit: [PAGE.contentWidth, PHOTO_HEIGHT],
      align: 'center', valign: 'center',
    });
  }

  let cursorY = TEXT_Y;
  if (page.page_title) {
    doc.font(boldFont).fontSize(TITLE_FONT_SIZE).fillColor(TITLE_COLOR);
    doc.text(page.page_title, PAGE.contentLeft, cursorY,
      { width: captionWidth, align: 'left', lineGap: 1 });
    cursorY = doc.y + 4;
  }
  if (page.caption) {
    doc.font(regularFont).fontSize(CAPTION_FONT_SIZE).fillColor(CAPTION_COLOR);
    doc.text(page.caption, PAGE.contentLeft, cursorY,
      { width: captionWidth, align: 'left', lineGap: 2 });
  }
  if (qrBuffer) {
    doc.image(qrBuffer, QR_X, QR_Y, { width: QR_SIZE, height: QR_SIZE });
    doc.font(regularFont).fontSize(QR_LABEL_SIZE).fillColor(QR_LABEL_COLOR);
    doc.text('음성 듣기', QR_X, QR_Y + QR_SIZE + 2,
      { width: QR_SIZE, align: 'center' });
  }
  doc.fillColor('#000');
}

const scenarios = [
  {
    name: 'short_no_title', page_title: null,
    caption: '제주도 첫째 날 도착 직후.',
    qr: true,
  },
  {
    name: 'short_with_title', page_title: '신혼여행 첫날',
    caption: '비행기에서 내리자마자 느꼈던 따뜻한 바람.',
    qr: true,
  },
  {
    name: 'medium_70chars', page_title: null,
    caption: '결혼 30주년 기념으로 다시 찾은 제주도. 30년 전 이야기가 아직도.',
    qr: true,
  },
  {
    name: 'long_caption', page_title: null,
    caption:
      '이 사진은 우리 가게가 케이터링 서비스를 한다고 광고를 한 사진이에요. 제가 이미지를 만들었지만, 이거 이미지 광고해서 들어온 오더는 거의 없었던 것 같아요. 그래서 케이터링 서비스는 전문적으로 하지 않기로 했고, 들어오는 오더만 받기로 했어요.',
    qr: true,
  },
  {
    name: 'long_with_title', page_title: '케이터링 서비스 광고',
    caption:
      '이 사진은 우리 가게가 케이터링 서비스를 한다고 광고를 한 사진이에요. 제가 이미지를 만들었지만, 이거 이미지 광고해서 들어온 오더는 거의 없었던 것 같아요. 그래서 케이터링 서비스는 전문적으로 하지 않기로 했고.',
    qr: true,
  },
  {
    name: 'no_caption_no_qr', page_title: null, caption: null, qr: false,
  },
  {
    name: 'long_caption_no_qr', page_title: null,
    caption:
      '음성 공유를 끄면 QR 이 사라져서 캡션이 사진 너비 전체를 사용할 수 있어야 합니다. 이건 그 케이스를 검증하는 페이지입니다. 글자 폭이 넓어진 만큼 줄 수가 줄어드는지 확인합니다.',
    qr: false,
  },
];

(async () => {
  for (const sc of scenarios) {
    const url = `${LISTEN_BASE_URL}/listen/tk_${sc.name}`;
    const qrBuffer = sc.qr
      ? await QRCode.toBuffer(url, {
          type: 'png', width: 220, margin: 2,
          color: { dark: '#1a1a1a', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        })
      : null;

    const doc = new PDFDocument({
      size: [PAGE.width, PAGE.height],
      margins: {
        top:    PAGE.contentTop,
        bottom: PAGE.height - PAGE.contentBottom,
        left:   PAGE.contentLeft,
        right:  PAGE.width - PAGE.contentRight,
      },
      pdfVersion: '1.4',
    });
    const { regularFont, boldFont } = registerFonts(doc);

    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    const done = new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
    });

    renderPage(
      doc,
      { page_number: 1, page_title: sc.page_title, caption: sc.caption },
      fakeBuffer,
      qrBuffer,
      regularFont,
      boldFont
    );
    doc.end();

    const buf = await done;
    const out = `/tmp/r1.1d-${sc.name}.pdf`;
    fs.writeFileSync(out, buf);
    console.log(`✅ ${out}  ${(buf.length / 1024).toFixed(1)} KB  caption=${(sc.caption || '').length}자`);
  }
})().catch(e => { console.error('❌', e?.message); console.error(e?.stack); process.exit(1); });
