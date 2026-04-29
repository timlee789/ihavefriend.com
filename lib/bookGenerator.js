/**
 * lib/bookGenerator.js — assemble a user's book content for PDF rendering.
 *
 * Walks the user_books.structure JSON, pulls the selected fragment for
 * each completed question, and returns an in-memory tree the PDF
 * renderer can iterate without further DB calls. When isPreview=false
 * we ask Gemini Flash for a 2–3 sentence chapter intro per chapter so
 * the book reads as a single calm narrative instead of a Q&A dump.
 *
 * Returns:
 *   {
 *     title: string,
 *     chapters: [{
 *       id, number, title, description, ai_intro?,
 *       sections: [{ question_id, question_prompt,
 *                    fragment_title, fragment_content }]
 *     }],
 *     stats: { total_questions, answered, completion_percent }
 *   }
 */

const { createDb } = require('./db');

const titleOf = (v) => {
  if (v && typeof v === 'object') return v.ko || v.en || v.es || '';
  return v || '';
};

async function assembleBookContent({ bookId, userId, isPreview = false }) {
  const db = createDb();

  // Book + structure
  const bookRes = await db.query(
    `SELECT id, title, structure, template_id
       FROM user_books
      WHERE id = $1 AND user_id = $2`,
    [bookId, userId]
  );
  if (bookRes.rows.length === 0) throw new Error('book not found');
  const book = bookRes.rows[0];

  // All responses for the book
  const respRes = await db.query(
    `SELECT question_id, status,
            fragment_ids, imported_fragment_ids,
            selected_fragment_id, selected_imported_id
       FROM user_book_responses
      WHERE book_id = $1`,
    [bookId]
  );

  // Pick the canonical fragment id per response (prefer direct, then imported)
  const allSelectedIds = [];
  const respMap = Object.create(null);
  for (const r of respRes.rows) {
    respMap[r.question_id] = r;
    if (r.status !== 'complete') continue;
    const directId   = r.selected_fragment_id   || (r.fragment_ids   || [])[0];
    const importedId = r.selected_imported_id   || (r.imported_fragment_ids || [])[0];
    const useId = directId || importedId;
    if (useId) allSelectedIds.push(useId);
  }

  // Bulk-fetch the chosen fragments
  const fragmentMap = Object.create(null);
  if (allSelectedIds.length > 0) {
    const fragRes = await db.query(
      `SELECT id, title, content
         FROM story_fragments
        WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [allSelectedIds, userId]
    );
    for (const f of fragRes.rows) fragmentMap[f.id] = f;
  }

  // Walk structure → build chapter list with sections
  const chapters = [];
  let totalAnswered = 0;
  let totalQuestions = 0;

  for (const ch of (book.structure?.chapters || [])) {
    if (ch.is_active === false) continue;

    const sections = [];
    for (const q of (ch.questions || [])) {
      if (q.is_active === false) continue;
      totalQuestions++;
      const r = respMap[q.id];
      if (!r || r.status !== 'complete') continue;

      const directId   = r.selected_fragment_id   || (r.fragment_ids   || [])[0];
      const importedId = r.selected_imported_id   || (r.imported_fragment_ids || [])[0];
      const useId = directId || importedId;
      const fragment = useId ? fragmentMap[useId] : null;
      if (!fragment) continue;

      totalAnswered++;
      sections.push({
        question_id:      q.id,
        question_prompt:  titleOf(q.prompt),
        fragment_title:   fragment.title,
        fragment_content: fragment.content || '',
      });
    }

    if (sections.length > 0) {
      chapters.push({
        id:          ch.id,
        number:      ch.order,
        title:       titleOf(ch.title),
        description: titleOf(ch.description),
        sections,
      });
    }
  }

  // AI chapter intros — skip for previews so the user gets the PDF fast.
  if (!isPreview && process.env.GEMINI_API_KEY && chapters.length > 0) {
    for (const ch of chapters) {
      try {
        ch.ai_intro = await generateChapterIntro(ch);
      } catch (e) {
        console.warn(`[bookGenerator] intro failed for ch ${ch.id}: ${e.message}`);
        ch.ai_intro = null;
      }
    }
  }

  return {
    title: book.title || '나의 책',
    chapters,
    stats: {
      total_questions: totalQuestions,
      answered: totalAnswered,
      completion_percent: totalQuestions > 0
        ? Math.round((totalAnswered / totalQuestions) * 100)
        : 0,
    },
  };
}

async function generateChapterIntro(chapter) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('no api key');

  const sectionSummary = chapter.sections
    .map(s => `- ${s.question_prompt}: ${(s.fragment_content || '').substring(0, 80).replace(/\n/g, ' ')}…`)
    .join('\n');

  const prompt = `자서전 책의 챕터 도입부를 한 문단(2-3문장)으로 자연스럽게 써주세요.
사용자의 이야기를 책으로 묶을 때 챕터 시작에 들어갈 부드러운 인트로입니다.

챕터 제목: ${chapter.title}
${chapter.description ? `챕터 설명: ${chapter.description}` : ''}

이 챕터에 담긴 이야기들:
${sectionSummary}

요구사항:
- 2-3문장
- 따뜻하고 차분한 톤
- 사용자의 인생을 존중하는 어조
- 구체적인 사건은 본문에서 다룰 테니 인트로는 챕터 분위기만
- "이번 챕터에서는..." 같은 메타 표현 금지
- 자연스럽게 챕터 주제로 들어가기

인트로만 출력 (제목/설명 없이):`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

module.exports = { assembleBookContent };
