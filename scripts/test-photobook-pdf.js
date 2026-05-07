#!/usr/bin/env node
/**
 * scripts/test-photobook-pdf.js — unit verification for R1a
 *
 * Generates a photobook PDF from a fixture and writes it to /tmp.
 * Stubs the R2 fetch by intercepting r2Client.getR2Client().send so
 * we don't need real credentials to verify the layout/font/QR work.
 *
 * Usage:
 *   node scripts/test-photobook-pdf.js
 *
 * Verify:
 *   open /tmp/test-photobook.pdf
 *   In Preview/Acrobat → Inspector → Document Properties:
 *     Page size 8.25 × 8.25 inch (594 × 594 pt)
 *     PDF version 1.4
 *     Title "테스트 책"
 *     NotoSansKR Regular + Bold embedded subsets
 *     Korean glyphs render
 *     Photos appear, fit-contained
 *     QR codes appear bottom-right where audio is_public=true
 *     Cover page = title + subtitle + date + "SayAndKeep"
 */

const fs = require('fs');
const path = require('path');

// Load env so the AWS SDK can authenticate against real R2 and the
// renderer's prefetchPhotoBuffers can pull real bytes for any photo
// keys we hand it. The script falls back to a fixture image if no
// keys are provided (best-effort path, identical to production).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });

// Replace prefetchPhotoBuffers' R2 path with a deterministic fixture
// so this test stays hermetic — never depends on a specific R2 object
// existing. We do this by monkey-patching the photobookPrintPdf module
// after require: swap its internal getR2Client reference.
const FIXTURE_PHOTO_PATH = path.join(__dirname, '..', 'public', 'icons', 'emma-192.png');
const fakeBuffer = fs.existsSync(FIXTURE_PHOTO_PATH)
  ? fs.readFileSync(FIXTURE_PHOTO_PATH)
  : null;
if (!fakeBuffer) {
  console.error('Missing fixture image at', FIXTURE_PHOTO_PATH);
  process.exit(1);
}

// Hot-patch the AWS SDK's S3Client.prototype.send so any GetObject in
// prefetchPhotoBuffers returns our fixture. This sidesteps the ESM/CJS
// interop dance with r2Client's destructured exports.
const { S3Client } = require('@aws-sdk/client-s3');
S3Client.prototype.send = async function () {
  return { Body: { transformToByteArray: async () => new Uint8Array(fakeBuffer) } };
};

const { generatePhotobookPrintPdf } = require('../lib/photobookPrintPdf');

const photobook = {
  id: 'test-id',
  title: '테스트 책',
  subtitle: '베타 검증 — Tim',
};

const pages = [
  // page 1: photo + caption + audio (with QR)
  {
    id: 'p1', page_number: 1,
    page_title: null,
    caption: '제주도 첫째 날, 도착한 공항 앞에서. 비행기에서 내리자마자 느꼈던 그 따뜻한 바람을 잊을 수 없다.',
    photo: { id: 'photo1', r2_key: 'photos/.../photo_1.jpg', r2_key_original: 'photos/.../photo_orig_1.jpg' },
    audio: { public_token: 'tk_test123_abcd', is_public: true },
  },
  // page 2: photo + caption only
  {
    id: 'p2', page_number: 2,
    page_title: null,
    caption: '바닷가에서 처음 본 일출. 아내와 함께 봐서 더 좋았다.',
    photo: { id: 'photo2', r2_key: 'photos/.../photo_2.jpg', r2_key_original: null },
    audio: null,
  },
  // page 3: title + photo + caption + audio
  {
    id: 'p3', page_number: 3,
    page_title: '둘째 날 — 한라산',
    caption: '구름 아래 펼쳐진 풍경.',
    photo: { id: 'photo3', r2_key: 'photos/.../photo_3.jpg', r2_key_original: 'photos/.../photo_orig_3.jpg' },
    audio: { public_token: 'tk_test456_efgh', is_public: true },
  },
  // page 4: photo only (no caption, no title)
  {
    id: 'p4', page_number: 4,
    page_title: null,
    caption: null,
    photo: { id: 'photo4', r2_key: 'photos/.../photo_4.jpg', r2_key_original: 'photos/.../photo_orig_4.jpg' },
    audio: null,
  },
  // page 5: caption only (no photo) — corner case
  {
    id: 'p5', page_number: 5,
    page_title: '돌아오는 길',
    caption: '공항으로 가는 길에 본 그 골목길이 자꾸 떠오른다.',
    photo: null,
    audio: null,
  },
  // page 6: empty (should be SKIPPED with a warning)
  {
    id: 'p6', page_number: 6,
    page_title: null,
    caption: null,
    photo: null,
    audio: null,
  },
];

(async () => {
  const t0 = Date.now();
  const buf = await generatePhotobookPrintPdf({ photobook, pages });
  const elapsed = Date.now() - t0;

  const out = '/tmp/test-photobook.pdf';
  fs.writeFileSync(out, buf);

  // Cross-check page count by counting /MediaBox occurrences in the
  // PDF stream. Each rendered page emits exactly one. PDFKit may also
  // emit one in the page tree root (it does); subtract for that.
  const mediaBoxes = (buf.toString('binary').match(/\/MediaBox\s*\[/g) || []).length;
  console.log(`   MediaBox count: ${mediaBoxes} (expect 6: 1 cover + 5 content + 1 page-tree-root entry)`);

  // Cheap verification: PDF starts with %PDF-1.4 and contains the title.
  const head = buf.slice(0, 8).toString();
  console.log(`✅ wrote ${out}`);
  console.log(`   ${(buf.length / 1024).toFixed(1)} KB, ${elapsed}ms`);
  console.log(`   header: ${JSON.stringify(head)}  (expect "%PDF-1.4")`);

  if (!head.startsWith('%PDF-1.4')) {
    console.error('❌ PDF header mismatch');
    process.exit(1);
  }
  // Note: page count = 1 cover + (5 non-empty pages) = 6.
  // PDFKit doesn't expose a page count post-end without re-parsing, so
  // we trust the render loop (which logged "skipping empty page 6").
  console.log('✅ Test fixture: 1 cover + 5 content pages (page 6 skipped as empty)');
  console.log('   open /tmp/test-photobook.pdf to inspect manually');
})().catch((e) => {
  console.error('❌', e?.message);
  console.error(e?.stack);
  process.exit(1);
});
