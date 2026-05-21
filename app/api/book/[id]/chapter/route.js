/**
 * POST /api/book/[id]/chapter
 *
 * Body: { title: string, description?, afterChapterId?, firstQuestion? }
 *
 * Adds a custom chapter (is_custom: true). Inserted after
 * `afterChapterId` if provided, otherwise appended. If a
 * `firstQuestion` string is supplied a single question is created
 * inside the chapter so the user has somewhere to land.
 *
 * Side effects:
 *   • structure JSON re-numbered (chapter.order = i+1)
 *   • new user_book_responses rows for any new questions
 *   • user_books.total_questions refreshed via countActiveQuestions
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { genId, countActiveQuestions } from '@/lib/bookStructure';

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId } = await params;
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const { title, description, afterChapterId, firstQuestion } = body || {};

  // body 단순 1차 검증 (책의 language 조회 후 정규화) — 빈 입력 빠르게 거절
  const titleHasContent =
    (typeof title === 'string' && title.trim()) ||
    (typeof title === 'object' && title !== null && !Array.isArray(title) &&
     Object.values(title).some(v => typeof v === 'string' && v.trim()));
  if (!titleHasContent) {
    return Response.json({ error: 'title required' }, { status: 400 });
  }

  const db = createDb();
  try {
    // 🔥 V3 Step 1e — user_books.language 직접 조회 (단순화).
    //   이전 Step 1d 의 LEFT JOIN derive 는 sample 시드가 모두 ko 라
    //   영문 책에서도 ko 반환하던 문제. 이제 컬럼 추가 후 직접 저장된 값 사용.
    const bookRes = await db.query(
      `SELECT structure, language FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const bookLang = bookRes.rows[0].language || 'ko';

    // title 정규화 — 책의 lang 키 하나만 저장 (단일 언어 정책)
    let titleStr = null;
    if (typeof title === 'string' && title.trim()) {
      titleStr = title.trim();
    } else if (typeof title === 'object' && title !== null && !Array.isArray(title)) {
      if (typeof title[bookLang] === 'string' && title[bookLang].trim()) {
        titleStr = title[bookLang].trim();
      } else {
        for (const v of Object.values(title)) {
          if (typeof v === 'string' && v.trim()) { titleStr = v.trim(); break; }
        }
      }
    }
    const titleObj = { [bookLang]: titleStr };

    // description 동일 패턴
    let descriptionStr = null;
    if (typeof description === 'string' && description.trim()) {
      descriptionStr = description.trim();
    } else if (typeof description === 'object' && description !== null && !Array.isArray(description)) {
      if (typeof description[bookLang] === 'string' && description[bookLang].trim()) {
        descriptionStr = description[bookLang].trim();
      } else {
        for (const v of Object.values(description)) {
          if (typeof v === 'string' && v.trim()) { descriptionStr = v.trim(); break; }
        }
      }
    }
    const descriptionObj = descriptionStr ? { [bookLang]: descriptionStr } : null;

    const structure = bookRes.rows[0].structure || { chapters: [] };
    if (!Array.isArray(structure.chapters)) structure.chapters = [];

    const newChapter = {
      id: genId('ch-custom'),
      order: 0, // recomputed below
      title:        titleObj,        // { [bookLang]: ... } 단일 키
      description:  descriptionObj,  // null 또는 { [bookLang]: ... } 단일 키
      intro_prompt: null,
      is_active:    true,
      is_custom:    true,
      questions:    [],
    };

    if (firstQuestion && typeof firstQuestion === 'string' && firstQuestion.trim()) {
      newChapter.questions.push({
        id:                genId('q-custom'),
        order:             1,
        prompt:            { [bookLang]: firstQuestion.trim() }, // 단일 언어 정책
        hint:              null,
        estimated_minutes: 5,
        is_optional:       false,
        is_active:         true,
        is_custom:         true,
      });
    }

    let insertIndex = structure.chapters.length;
    if (afterChapterId) {
      const idx = structure.chapters.findIndex(c => c.id === afterChapterId);
      if (idx >= 0) insertIndex = idx + 1;
    }
    structure.chapters.splice(insertIndex, 0, newChapter);
    structure.chapters.forEach((c, i) => { c.order = i + 1; });

    // Bulk-insert response rows for any new questions.
    if (newChapter.questions.length > 0) {
      const placeholders = newChapter.questions
        .map((_, i) => `($1, $2, $${i + 3})`).join(', ');
      const args = [bookId, user.id, ...newChapter.questions.map(q => q.id)];
      await db.query(
        `INSERT INTO user_book_responses (book_id, user_id, question_id) VALUES ${placeholders}`,
        args
      );
    }

    const totalQuestions = countActiveQuestions(structure);

    await db.query(
      `UPDATE user_books
          SET structure       = $1::jsonb,
              total_questions = $2,
              last_active_at  = NOW()
        WHERE id = $3 AND user_id = $4`,
      [JSON.stringify(structure), totalQuestions, bookId, user.id]
    );

    return Response.json({ ok: true, chapter: newChapter });
  } catch (e) {
    console.error('[POST /api/book/[id]/chapter]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
