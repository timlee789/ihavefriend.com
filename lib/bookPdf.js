/**
 * lib/bookPdf.js — render an assembled book to a PDF Buffer.
 *
 * Uses PDFKit. Page size A5 (148 × 210 mm) so the printed result
 * looks like a real keepsake book; 50pt outer margin keeps line
 * length comfortable on a phone preview without wasting paper.
 *
 * Korean glyphs require a real CJK font — Helvetica falls back to
 * empty boxes. We register the bundled Noto Sans KR Regular + Bold
 * (in public/fonts/) at file open. If those files are missing the
 * renderer still produces a PDF, but Korean text will be blank.
 *
 * Layout:
 *   1. Cover  — title (bold, 28pt), one subtitle line, today's date
 *   2. TOC    — chapter numbers + titles
 *   3. Chapters — page-per-chapter; AI intro (when present) sits
 *                 between the chapter title and the Q&A sections;
 *                 each section is a bold question followed by the
 *                 fragment content.
 *   4. Footers — page numbers, skipped on the cover.
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs   = require('fs');
const path = require('path');

const REGULAR_FONT_FILE = 'NotoSansKR-Regular.otf';
const BOLD_FONT_FILE    = 'NotoSansKR-Bold.otf';

// 🔥 Step 10 (Voice QR) — base URL for /listen/[token] links printed
//   in the PDF. Defaults to https://sayandkeep.com so a printed
//   keepsake book always points at the live site, regardless of
//   which env (dev/preview/prod) generated the PDF.
const LISTEN_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sayandkeep.com';

/**
 * 🔥 Task 75 — Pre-fetch every photo's bytes once, in parallel, before
 * the (synchronous) PDF render loop runs. Without this we'd have to
 * `await` each photo inside the for-loop, which fights PDFKit's
 * buffering model and adds 50× the wall-clock time.
 */
/**
 * 🔥 Step 10 (Voice QR) — Pre-generate QR code PNG buffers for every
 * section that has audio attached. Same parallel-prefetch pattern as
 * photos so the synchronous PDF render loop doesn't block on
 * QRCode.toBuffer() round-trips.
 */
async function prefetchAudioQrBuffers(chapters) {
  const all = [];
  for (const ch of (chapters || [])) {
    for (const sec of (ch.sections || [])) {
      if (sec?.audio?.public_token) all.push(sec);
    }
  }
  const out = new Map();
  if (all.length === 0) return out;

  await Promise.all(all.map(async (sec) => {
    const token = sec.audio.public_token;
    const url = `${LISTEN_BASE_URL.replace(/\/$/, '')}/listen/${token}`;
    try {
      const buf = await QRCode.toBuffer(url, {
        type: 'png',
        width: 220,    // ~80pt at 96dpi → fits A5 margin
        margin: 2,
        color: { dark: '#1a1a1a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      out.set(token, buf);
    } catch (e) {
      console.warn(`[bookPdf] QR generation failed for token ${token}: ${e?.message}`);
    }
  }));
  console.log(`[bookPdf] prefetched ${out.size}/${all.length} QR code(s)`);
  return out;
}

async function prefetchPhotoBuffers(chapters) {
  const all = [];
  for (const ch of (chapters || [])) {
    for (const sec of (ch.sections || [])) {
      for (const p of (sec.photos || [])) {
        if (p?.id && p?.blob_url) all.push(p);
      }
    }
  }
  const out = new Map();
  if (all.length === 0) return out;

  await Promise.all(all.map(async (p) => {
    try {
      const res = await fetch(p.blob_url);
      if (!res.ok) {
        console.warn(`[bookPdf] photo fetch ${res.status}: ${p.blob_url}`);
        return;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      out.set(p.id, buf);
    } catch (e) {
      console.warn(`[bookPdf] photo fetch error: ${e?.message}`);
    }
  }));
  console.log(`[bookPdf] prefetched ${out.size}/${all.length} photo(s)`);
  return out;
}

async function generatePdfBuffer({
  title,
  authorLabel,         // 🔥 Step 2b — 표지 저자명 ("김순자 구술")
  coverPhoto,          // 🔥 Step 2b — 표지 사진 옵션 { url } 또는 { buffer }
  chapters,
  stats,
  lang = 'ko',
}) {
  // Photos + QR codes must be ready before we hit the render loop.
  const photoBuffers = await prefetchPhotoBuffers(chapters);
  const qrBuffers    = await prefetchAudioQrBuffers(chapters);

  // 🔥 Step 2b — 표지 사진 prefetch. coverPhoto.buffer 우선, 없으면 url 에서 fetch.
  //   샘플엔 사진 없음 — 구조만 준비. 실제 사용자 책에서 업로드 UI 와 연결.
  let coverPhotoBuf = null;
  if (coverPhoto?.buffer) {
    coverPhotoBuf = coverPhoto.buffer;
  } else if (coverPhoto?.url) {
    try {
      const res = await fetch(coverPhoto.url);
      if (res.ok) {
        coverPhotoBuf = Buffer.from(await res.arrayBuffer());
      } else {
        console.warn(`[bookPdf] cover photo fetch ${res.status}: ${coverPhoto.url}`);
      }
    } catch (e) {
      console.warn(`[bookPdf] cover photo fetch error: ${e?.message}`);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A5',
        bufferPages: true, // needed so we can backfill page numbers in the footer pass
        margins: { top: 60, bottom: 60, left: 50, right: 50 },
        info: { Title: title || 'Book', Author: 'SayAndKeep' },
      });

      // ── Font registration ─────────────────────────────────────
      const fontDir   = path.join(process.cwd(), 'public', 'fonts');
      const regPath   = path.join(fontDir, REGULAR_FONT_FILE);
      const boldPath  = path.join(fontDir, BOLD_FONT_FILE);
      let regularFont = 'Helvetica';
      let boldFont    = 'Helvetica-Bold';
      if (fs.existsSync(regPath)) {
        doc.registerFont('NotoKR', regPath);
        regularFont = 'NotoKR';
      } else {
        console.warn(`[bookPdf] missing ${REGULAR_FONT_FILE}; Korean will not render`);
      }
      if (fs.existsSync(boldPath)) {
        doc.registerFont('NotoKR-Bold', boldPath);
        boldFont = 'NotoKR-Bold';
      } else {
        console.warn(`[bookPdf] missing ${BOLD_FONT_FILE}; Korean bold falls back to regular`);
        boldFont = regularFont; // better than Helvetica-Bold which can't render Korean
      }

      const buffers = [];
      doc.on('data',  buffers.push.bind(buffers));
      doc.on('end',   () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // ── Cover page ────────────────────────────────────────────
      // 🔥 Step 2b (2026-05-21) — 표지 재구성. Tim 의 결정:
      //   - 제목 (28pt bold)
      //   - 사진 (옵션, coverPhotoBuf 있으면 중앙 배치)
      //   - 저자명 (15pt, #444, "김순자 구술" 식의 authorLabel)
      //   - 부제 "SayAndKeep · N개 챕터..." 제거
      //   - 날짜 → 판권지 (뒷장) 으로 이동
      doc.moveDown(coverPhotoBuf ? 2 : 5);
      doc.font(boldFont).fontSize(28);
      doc.text(title || '나의 책', { align: 'center' });
      doc.moveDown(1.5);

      // 표지 사진 (옵션) — coverPhotoBuf 있으면 제목과 저자명 사이 중앙.
      //   A5 폭 ~348pt → 사진 280pt 폭, 최대 300pt 높이 fit. doc.image 가
      //   커서 y 자동 갱신 안 하므로 수동 보정.
      if (coverPhotoBuf) {
        try {
          const imgW = 280;
          const imgH = 300;
          const imgX = (doc.page.width - imgW) / 2;
          const yBefore = doc.y;
          doc.image(coverPhotoBuf, imgX, yBefore, { fit: [imgW, imgH], align: 'center' });
          // 근사 — fit 의 실제 height 추적 어려우니 imgH 전체 + 여백 사용.
          doc.y = yBefore + imgH + 20;
        } catch (e) {
          console.warn(`[bookPdf] cover photo embed failed: ${e?.message}`);
        }
      }

      // 저자명 (authorLabel) — 사진 있으면 아래, 없으면 제목 아래 여유.
      if (authorLabel) {
        doc.moveDown(coverPhotoBuf ? 1 : 3);
        doc.font(regularFont).fontSize(15).fillColor('#444');
        doc.text(authorLabel, { align: 'center', lineBreak: false });
        doc.fillColor('#000');
      }

      // ── Table of contents ────────────────────────────────────
      doc.addPage();
      doc.font(boldFont).fontSize(18).text('목차', { align: 'center' });
      doc.moveDown(2);
      doc.font(regularFont).fontSize(12);
      for (const ch of chapters) {
        doc.text(`${ch.number}. ${ch.title}`, { lineGap: 6 });
      }

      // ── Chapter bodies ───────────────────────────────────────
      for (const ch of chapters) {
        doc.addPage();

        doc.font(boldFont).fontSize(20);
        doc.text(`${ch.number}. ${ch.title}`, { align: 'left' });
        doc.moveDown(1);

        // AI-generated intro (preview path leaves this null and we
        // fall through to the chapter description if there is one)
        if (ch.ai_intro && ch.ai_intro.trim()) {
          doc.font(regularFont).fontSize(11).fillColor('#444');
          doc.text(ch.ai_intro.trim(), {
            align:  'justify',
            lineGap: 4,
          });
          doc.fillColor('#000');
          doc.moveDown(1.5);
        } else if (ch.description) {
          doc.font(regularFont).fontSize(11).fillColor('#666');
          doc.text(ch.description, { align: 'left', lineGap: 4 });
          doc.fillColor('#000');
          doc.moveDown(1);
        }

        // Q&A sections
        for (const section of ch.sections) {
          doc.moveDown(0.8);
          // Beta Step 2 (2026-05-21) — 이야기책 (collections) 은 소제목 없음.
          //   question_prompt 가 빈 문자열일 때 bold 헤더 줄 + moveDown 모두 스킵 →
          //   본문 바로 시작. 자서전은 prompt 가 항상 있어서 영향 없음.
          const heading = (section.question_prompt || '').trim();
          if (heading) {
            doc.font(boldFont).fontSize(12).fillColor('#1a1a1a');
            doc.text(heading, { lineGap: 4 });
            doc.moveDown(0.4);
          }

          // PDFKit doesn't parse markdown — strip the ** wrappers
          // generateFragmentCloud sometimes emits around question
          // headers. Other markdown markers (#, *, _) are rare and
          // intentional in user prose, so we leave them.
          const cleanContent = (section.fragment_content || '')
            .trim()
            .replace(/\*\*(.+?)\*\*/g, '$1');

          doc.font(regularFont).fontSize(11).fillColor('#222');
          doc.text(cleanContent, {
            align:        'justify',
            lineGap:      5,
            paragraphGap: 4,
          });
          doc.fillColor('#000');

          // 🔥 Task 75 — embed photos right after the body text. A5
          // body width is ~350pt; 350×260 keeps the image centered and
          // leaves breathing room for the next Q&A. Each photo lands
          // on its own line (PDFKit advances the cursor automatically).
          if (Array.isArray(section.photos) && section.photos.length > 0) {
            doc.moveDown(0.6);
            for (const photo of section.photos) {
              const buf = photoBuffers.get(photo.id);
              if (!buf) continue;
              try {
                doc.image(buf, { fit: [350, 260], align: 'center' });
                doc.moveDown(0.6);
              } catch (e) {
                console.warn(`[bookPdf] photo embed failed: ${e?.message}`);
              }
            }
            doc.moveDown(0.4);
          }

          // 🔥 Step 10 (Voice QR) — embed the audio QR code at the
          // end of each section that has voice attached. Right-aligned
          // 90×90pt QR with a small "원본 음성 듣기" label below.
          // Family members scan with phone → /listen/[token] page.
          //
          // Skipped silently when:
          //   - section has no audio
          //   - QR generation failed in prefetch
          //   - audio.is_public is false (set on the data builder
          //     side; we do NOT want a printed QR pointing at a
          //     private URL that returns 404)
          if (
            section.audio?.public_token &&
            section.audio?.is_public !== false
          ) {
            const qrBuf = qrBuffers.get(section.audio.public_token);
            if (qrBuf) {
              try {
                doc.moveDown(0.4);
                const qrSize = 90;
                const pageRight = doc.page.width - doc.page.margins.right;
                const qrX = pageRight - qrSize;
                const qrY = doc.y;
                // Right-aligned image
                doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });
                // Label below QR
                doc.font(regularFont).fontSize(8).fillColor('#666');
                const labelText =
                  lang === 'en' ? '🎙️ Original voice'  :
                  lang === 'es' ? '🎙️ Voz original'    :
                                  '🎙️ 원본 음성 듣기';
                doc.text(
                  labelText,
                  qrX,
                  qrY + qrSize + 2,
                  { width: qrSize, align: 'center' }
                );
                doc.fillColor('#000');
                // Advance cursor below the QR + label
                doc.y = qrY + qrSize + 18;
                doc.x = doc.page.margins.left;
              } catch (e) {
                console.warn(`[bookPdf] QR embed failed: ${e?.message}`);
              }
            }
          }
        }
      }

      // ── Colophon (판권지) — 마지막 페이지에 제작 정보 ─────────
      // 🔥 Step 2b (2026-05-21) — 날짜를 표지에서 분리. 책 맨 뒤 판권지가
      //   전통적 자리 — "SayAndKeep 으로 만든 책 · 날짜" 중앙. 사용자
      //   심리적으로 책의 닫힘 (마무리) 신호.
      doc.addPage();
      doc.moveDown(15);
      doc.font(regularFont).fontSize(10).fillColor('#888');
      const today = new Date().toLocaleDateString(
        lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'ko-KR',
        { year: 'numeric', month: 'long', day: 'numeric' }
      );
      const colophonText =
        lang === 'en' ? `Made with SayAndKeep · ${today}` :
        lang === 'es' ? `Hecho con SayAndKeep · ${today}` :
                        `SayAndKeep 으로 만든 책 · ${today}`;
      doc.text(colophonText, { align: 'center', lineBreak: false });
      doc.fillColor('#000');

      // ── Page-number footer pass ──────────────────────────────
      // 🔥 Step 2b (2026-05-21) — Tim 의 끝 빈 페이지 버그 수정.
      //   진짜 원인 (재현 후 확인): footer 의 doc.text 가 페이지 최하단 위치
      //   (height - 40) 에서 PDFKit 의 layout engine 이 텍스트 박스 height
      //   를 페이지 끝까지로 가정 → 다음 줄 공간이 없다고 판단 → addPage()
      //   호출. 결과적으로 본문 페이지 수만큼의 빈 페이지가 footer 패스에서
      //   복제됨 (예: 33페이지 → 66페이지).
      //
      //   해결책 2단:
      //     1. lineBreak: false  — 줄바꿈 시도 자체 차단
      //     2. height: 20        — 텍스트 박스 명시적 높이 제한
      //                            (이게 핵심 — height 없으면 layout engine
      //                             이 페이지 끝까지 박스로 잡아 pagination
      //                             트리거)
      //
      //   재현 (33챕터 → footer 추가 → 66페이지) → 수정 (height: 20 추가 →
      //   33페이지 유지) 확인됨.
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        // page 0 = cover, no number
        if (i === 0) continue;
        doc.switchToPage(i);
        // PDFKit retains the last-set margin, but writing to fixed
        //   coordinates with x=50 / y=height-40 avoids the cursor.
        doc.font(regularFont).fontSize(9).fillColor('#888');
        doc.text(
          `${i}`,
          50,
          doc.page.height - 40,
          {
            align: 'center',
            width: doc.page.width - 100,
            height: 20,         // 🔥 핵심 — 텍스트 박스 명시 높이 (layout engine 의 pagination 차단)
            lineBreak: false,   // 🔥 추가 안전망 — 줄바꿈 시도 자체 차단
          }
        );
        doc.fillColor('#000');
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generatePdfBuffer };
