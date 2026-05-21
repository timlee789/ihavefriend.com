#!/usr/bin/env node
/**
 * scripts/sample-memoir-to-pdf.js
 *
 * sayandkeep_samples/memoir.json (김순자 9장) 을 lib/bookPdf.js 의
 * generatePdfBuffer() 가 받는 형태로 변환 후 memoir-sample.pdf 로 저장.
 *
 * 사용법 (프로젝트 루트에서):
 *   node scripts/sample-memoir-to-pdf.js
 *
 * Mapping 전략:
 *   memoir.json 은 narrative paragraphs[] 구조 (Q&A 아님). bookPdf 의 chapter
 *   에는 ai_intro (본문) 필드가 있어 이걸로 paragraphs[] 를 단락 사이 빈 줄로
 *   합쳐 넣음. sections=[] 로 두면 Q&A 블록 skip — 깔끔한 자서전 흐름.
 *
 *   cover stats 라인은 bookPdf 가 "X개 챕터 · Y개 이야기" 로 하드코딩.
 *   memoir 는 "이야기" 단위가 챕터 자체라 stats.answered = chapters.length.
 */

const fs   = require('fs');
const path = require('path');
const { generatePdfBuffer } = require('../lib/bookPdf.js');

const PROJECT_ROOT = path.join(__dirname, '..');
const SAMPLE_PATH  = path.join(PROJECT_ROOT, 'sayandkeep_samples', 'memoir.json');
const OUT_PATH     = path.join(PROJECT_ROOT, 'memoir-sample.pdf');

async function main() {
  if (!fs.existsSync(SAMPLE_PATH)) {
    throw new Error(`memoir sample not found at ${SAMPLE_PATH}`);
  }
  const memoir = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));

  const chapters = (memoir.chapters || []).map(ch => ({
    number:   ch.number,
    title:    ch.title,
    // narrative paragraphs → ai_intro (justified body text, fontSize 11, #444).
    // 단락 사이 빈 줄로 자연 호흡 — PDFKit 가 \n\n 을 paragraph break 로 처리.
    ai_intro: (ch.paragraphs || []).join('\n\n'),
    sections: [],
  }));

  const totalParagraphs = (memoir.chapters || []).reduce(
    (sum, ch) => sum + ((ch.paragraphs || []).length), 0
  );

  console.log(`[sample-memoir-to-pdf] title="${memoir.title}" author=${memoir.author || '?'}`);
  console.log(`[sample-memoir-to-pdf] chapters=${chapters.length} paragraphs=${totalParagraphs}`);

  const pdfBuffer = await generatePdfBuffer({
    title:       memoir.title,
    authorLabel: memoir.authorLabel,  // 🔥 Step 2b — 표지 저자명 "김순자 구술"
    // coverPhoto 는 샘플에 없음 — 구조만 준비됨 (실제 사용자 책에서 업로드 UI 연결).
    chapters,
    stats:       { answered: chapters.length },
    lang:        'ko',
  });

  fs.writeFileSync(OUT_PATH, pdfBuffer);
  console.log(`[sample-memoir-to-pdf] ✓ wrote ${OUT_PATH} (${pdfBuffer.length} bytes)`);
}

main().catch(err => {
  console.error('[sample-memoir-to-pdf] failed:', err);
  process.exit(1);
});
