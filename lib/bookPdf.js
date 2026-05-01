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
const fs   = require('fs');
const path = require('path');

const REGULAR_FONT_FILE = 'NotoSansKR-Regular.otf';
const BOLD_FONT_FILE    = 'NotoSansKR-Bold.otf';

/**
 * 🔥 Task 75 — Pre-fetch every photo's bytes once, in parallel, before
 * the (synchronous) PDF render loop runs. Without this we'd have to
 * `await` each photo inside the for-loop, which fights PDFKit's
 * buffering model and adds 50× the wall-clock time.
 */
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

async function generatePdfBuffer({ title, chapters, stats, lang = 'ko' }) {
  // Photos must be ready before we hit the render loop.
  const photoBuffers = await prefetchPhotoBuffers(chapters);

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
      doc.font(boldFont).fontSize(28);
      doc.moveDown(4);
      doc.text(title || '나의 책', { align: 'center' });
      doc.moveDown(2);
      doc.font(regularFont).fontSize(12);
      doc.text(
        `SayAndKeep · ${chapters.length}개 챕터 · ${stats.answered}개 이야기`,
        { align: 'center' }
      );
      doc.moveDown(8);
      doc.fontSize(10).fillColor('#666');
      const today = new Date().toLocaleDateString(
        lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'ko-KR',
        { year: 'numeric', month: 'long', day: 'numeric' }
      );
      doc.text(today, { align: 'center' });
      doc.fillColor('#000');

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
          doc.font(boldFont).fontSize(12).fillColor('#1a1a1a');
          doc.text(section.question_prompt, { lineGap: 4 });
          doc.moveDown(0.4);

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
        }
      }

      // ── Page-number footer pass ──────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
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
          { align: 'center', width: doc.page.width - 100 }
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
