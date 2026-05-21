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

async function assembleBookContent({ bookId, userId, isPreview = false, lang = 'ko' }) {
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
    // 🔥 Task 75 — pull photos alongside fragment text. Correlated
    // json_agg keeps the row shape friendly to the downstream code
    // that just spreads `fragment.*` fields.
    // 🔥 Step 10 (Voice QR) — LEFT JOIN fragment_audios so each row
    //   carries the public token + visibility flag for QR rendering
    //   in lib/bookPdf.js. LEFT JOIN keeps fragments without audio
    //   working unchanged (a.* columns become NULL, section.audio = null).
    const fragRes = await db.query(
      `SELECT
         f.id, f.title, f.content,
         a.public_token  AS audio_public_token,
         a.is_public     AS audio_is_public,
         a.duration_sec  AS audio_duration_sec,
         COALESCE((
           SELECT json_agg(
                    json_build_object(
                      'id',            p.id,
                      'blob_url',      p.blob_url,
                      'width',         p.width,
                      'height',        p.height,
                      'display_order', p.display_order
                    ) ORDER BY p.display_order
                  )
             FROM fragment_photos p
            WHERE p.fragment_id = f.id
         ), '[]'::json) AS photos
       FROM story_fragments f
       LEFT JOIN fragment_audios a ON a.fragment_id = f.id
      WHERE f.id = ANY($1::uuid[]) AND f.user_id = $2`,
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
        // 🔥 Task 75 — embedded by lib/bookPdf.js after the body text.
        photos:           Array.isArray(fragment.photos) ? fragment.photos : [],
        // 🔥 Step 10 (Voice QR) — surface audio metadata so bookPdf.js
        //   can render the per-section QR. Null when the fragment has
        //   no audio (LEFT JOIN miss).
        audio:            fragment.audio_public_token ? {
          public_token: fragment.audio_public_token,
          is_public:    fragment.audio_is_public,
          duration_sec: fragment.audio_duration_sec,
        } : null,
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

  // 🔥 Milestone 5 Step 4 (2026-05-21) — AI 챕터 intro 완전 제거 (Tim 결정).
  //   이유:
  //   - 자서전엔 사용자 본인 이야기가 바로 시작되는 게 더 진정성 있음
  //   - Gemini 챕터 제목 언어 bias 문제 (Step 3) 자동 소멸
  //   - 비용 0 (Gemini 호출 없음), 속도 8s → 0.3s
  //   - preview 와 generate 가 거의 같은 결과 (둘 다 intro 없음)
  //   isPreview 매개변수는 호환 위해 유지 (현재 동작 차이 없음). 향후
  //   필요 시 사용 가능.

  // Milestone 5 Step 3 — 제목 fallback 도 lang 따르기.
  const defaultTitle = lang === 'en' ? 'My Book'
                     : lang === 'es' ? 'Mi libro'
                     : '나의 책';
  return {
    title: book.title || defaultTitle,
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

// 🔥 Milestone 5 Step 4 — generateChapterIntro 함수 완전 삭제됨 (Tim 결정).
//   호출처 없음. ko/en/es 다국어 프롬프트도 함께 제거. 비용 0, 속도 ↑.
//   bookPdf.js 의 `if (ch.ai_intro)` 가드로 ai_intro 미존재 시 자동 skip.

module.exports = { assembleBookContent };
