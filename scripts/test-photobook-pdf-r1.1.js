#!/usr/bin/env node
/**
 * scripts/test-photobook-pdf-r1.1.js — caption-length matrix for R1.1
 *
 * Generates one PDF per scenario so each can be QuickLook-rendered
 * independently (qlmanage only screenshots page 1). Scenarios cover
 * the full caption-length matrix the new layout must handle:
 *
 *   short_no_title    pattern A, ~30 chars, no page_title
 *   short_with_title  pattern A, ~30 chars, with page_title
 *   medium_no_title   pattern A boundary, ~80 chars
 *   long_no_title     pattern B, ~150 chars (3-4 line caption)
 *   long_with_title   pattern B, ~200 chars + page_title
 *   no_caption_no_qr  no caption + no audio (sparse)
 *   no_qr_long_caption pattern B but no QR (caption uses full width)
 *
 * Stubs R2 fetch via S3Client.prototype.send so any photo "loads"
 * to the fixture image (icons/emma-192.png).
 */

const path = require('path');
const fs   = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const FIXTURE_PHOTO_PATH = path.join(__dirname, '..', 'public', 'icons', 'emma-192.png');
const fakeBuffer = fs.readFileSync(FIXTURE_PHOTO_PATH);

const { S3Client } = require('@aws-sdk/client-s3');
S3Client.prototype.send = async function () {
  return { Body: { transformToByteArray: async () => new Uint8Array(fakeBuffer) } };
};

const { generatePhotobookPrintPdf } = require('../lib/photobookPrintPdf');

const photobook = { id: 't', title: 'R1.1 layout 검증', subtitle: '캡션 길이 매트릭스' };

const scenarios = [
  {
    name: 'short_no_title',
    page_title: null,
    caption: '제주도 첫째 날 도착 직후.',
    audio: { public_token: 'tk_short_a___1', is_public: true },
  },
  {
    name: 'short_with_title',
    page_title: '신혼여행 첫날',
    caption: '비행기에서 내리자마자 느꼈던 따뜻한 바람.',
    audio: { public_token: 'tk_short_b___2', is_public: true },
  },
  {
    name: 'medium_80chars',
    page_title: null,
    caption:
      '결혼 30주년 기념으로 다시 찾은 제주도. 30년 전 이 곳에서 시작했던 이야기는 아직도 우리에게.',
    audio: { public_token: 'tk_med_____c__3', is_public: true },
  },
  {
    name: 'long_no_title',
    page_title: null,
    caption:
      '이 사진은 우리 가게가 케이터링 서비스를 한다고 광고를 한 사진이에요. 제가 이미지를 만들었지만, 이거 이미지 광고해서 들어온 오더는 거의 없었던 것 같아요. 그래서 케이터링 서비스는 전문적으로 하지 않기로 했고, 들어오는 오더만 받기로 했어요.',
    audio: { public_token: 'tk_long____d__4', is_public: true },
  },
  {
    name: 'long_with_title',
    page_title: '케이터링 서비스 광고',
    caption:
      '이 사진은 우리 가게가 케이터링 서비스를 한다고 광고를 한 사진이에요. 제가 이미지를 만들었지만, 이거 이미지 광고해서 들어온 오더는 거의 없었던 것 같아요. 그래서 케이터링 서비스는 전문적으로 하지 않기로 했고, 들어오는 오더만 받기로 했어요. 광고 만드는 비용보다 받은 오더가 적었어요.',
    audio: { public_token: 'tk_longt___e__5', is_public: true },
  },
  {
    name: 'no_caption_no_qr',
    page_title: null,
    caption: null,
    audio: null,
  },
  {
    name: 'long_caption_no_qr',
    page_title: null,
    caption:
      '음성 공유를 끄면 QR 이 사라져서 캡션이 사진 너비 전체를 사용할 수 있어야 합니다. 이건 그 케이스를 검증하는 페이지입니다. 글자 폭이 넓어진 만큼 줄 수가 줄어드는지 확인합니다.',
    audio: null,
  },
];

(async () => {
  for (const sc of scenarios) {
    const pages = [
      {
        id:          'page-' + sc.name,
        page_number: 1,
        page_title:  sc.page_title,
        caption:     sc.caption,
        photo:       { id: 'p-' + sc.name, r2_key: 'photos/x.jpg', r2_key_original: null },
        audio:       sc.audio,
      },
    ];
    const buf = await generatePhotobookPrintPdf({
      photobook: { ...photobook, title: `R1.1 — ${sc.name}` },
      pages,
    });
    const out = `/tmp/r1.1-${sc.name}.pdf`;
    fs.writeFileSync(out, buf);
    console.log(`✅ ${out}  ${(buf.length / 1024).toFixed(1)} KB  caption=${(sc.caption || '').length}자`);
  }
  console.log('\nDone. Render any with: qlmanage -t -s 700 -o /tmp /tmp/r1.1-<name>.pdf');
})().catch(e => { console.error('❌', e?.message); console.error(e?.stack); process.exit(1); });
