/**
 * lib/storyBookGenerator.js — 이야기책 (collections) → PDF assemble.
 *
 * 자서전 lib/bookGenerator.js 의 collections 버전:
 *   자서전:   user_books.structure (AI 챕터/주제, top-down)
 *   이야기책: user_collections + collection_fragments (사용자 자유 묶기, bottom-up)
 *
 * 데이터 매핑:
 *   collection            → chapter (number = display_order 기반 1부터)
 *   collection_fragments  → sections (한 챕터의 본문 단위들)
 *   story_fragments       → section.fragment_content (소제목 없음 — 자서전과 차이)
 *
 * 자서전과 달리:
 *   - question_prompt = '' (이야기책은 소제목 없음 — bookPdf 의 빈 헤더 가드가 처리)
 *   - AI intro 없음 (자서전 Step 4 에서 제거한 패턴과 동일)
 *
 * 반환 형식은 bookPdf.js 의 generatePdfBuffer 와 호환:
 *   { title, chapters: [{ number, title, sections: [...] }], stats }
 *
 * 사진 + 음성 QR 은 자서전과 동일 (bookPdf 의 prefetch 로직이 알아서 처리).
 */

const { createDb } = require('./db');

async function assembleStoryBookContent({ userId, lang = 'ko', title = null }) {
  const db = createDb();

  // 1. 사용자의 collections (display_order 순)
  const colRes = await db.query(
    `SELECT id, name, description, display_order
       FROM user_collections
      WHERE user_id = $1
      ORDER BY display_order ASC, created_at ASC`,
    [userId]
  );

  const chapters = [];
  let totalFragments = 0;
  let chapterNumber = 0;

  for (const col of colRes.rows) {
    // 2. 각 collection 의 fragments — user_order 우선, fallback added_at.
    //   schema: collection_fragments.user_order + added_at (display_order/created_at 아님)
    const fragRes = await db.query(
      `SELECT
         f.id, f.title, f.content, f.word_count,
         cf.user_order, cf.added_at,
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
             FROM fragment_photos p WHERE p.fragment_id = f.id
         ), '[]'::json) AS photos
       FROM collection_fragments cf
       JOIN story_fragments f ON f.id = cf.fragment_id
       LEFT JOIN fragment_audios a ON a.fragment_id = f.id
      WHERE cf.collection_id = $1 AND f.user_id = $2
        AND f.status != 'DELETED'::"FragmentStatus"
      ORDER BY cf.user_order ASC, cf.added_at ASC`,
      [col.id, userId]
    );

    if (fragRes.rows.length === 0) continue;  // 빈 챕터 스킵

    chapterNumber++;
    const sections = fragRes.rows.map(f => ({
      question_id:      f.id,
      // 이야기책은 소제목(질문) 없음. bookPdf 의 `if (heading)` 가드가
      //   빈 문자열이면 bold 헤더 줄 + moveDown 모두 스킵 (Step 2 변경).
      question_prompt:  '',
      fragment_title:   f.title,
      fragment_content: f.content || '',
      photos:           Array.isArray(f.photos) ? f.photos : [],
      audio:            f.audio_public_token ? {
        public_token: f.audio_public_token,
        is_public:    f.audio_is_public,
        duration_sec: f.audio_duration_sec,
      } : null,
    }));
    totalFragments += sections.length;

    chapters.push({
      id:          col.id,
      number:      chapterNumber,
      title:       col.name,
      description: col.description || '',
      sections,
    });
  }

  // 제목 fallback (자서전 bookGenerator 와 같은 패턴).
  const defaultTitle = lang === 'en' ? 'My Stories'
                     : lang === 'es' ? 'Mis historias'
                     : '나의 이야기책';

  return {
    title: title || defaultTitle,
    chapters,
    stats: {
      total_questions:    totalFragments,
      answered:           totalFragments,
      completion_percent: 100,
    },
  };
}

module.exports = { assembleStoryBookContent };
