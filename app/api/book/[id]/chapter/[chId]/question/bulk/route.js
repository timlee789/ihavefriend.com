/**
 * POST /api/book/[id]/chapter/[chId]/question/bulk
 *
 * V3 Milestone 3 Step 2b — N개 질문을 한 번에 chapter.questions[] 에 INSERT.
 *
 * 용도:
 *   ChapterEntryV3 의 "Show 9 new questions" 흐름 — LLM 이 생성한 9개 질문을
 *   클라이언트가 받은 후 DB 에 저장하기 위해 호출. 이전엔 localStorage 의
 *   customQuestions 에만 저장돼서 save endpoint 가 keepIds 검증에 실패했음.
 *
 *   사용자 직접 만든 1개 질문은 기존 single-question endpoint 사용
 *   (이 endpoint 는 LLM 생성 N개 케이스 전용).
 *
 * Body:
 *   {
 *     "questions": [
 *       { "prompt": "...", "hint": "..." },
 *       { "prompt": "..." },
 *       ...
 *     ]
 *   }
 *   - questions 배열 1~20개
 *   - 각 항목의 prompt 는 non-empty string
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "questions": [생성된 question 객체들],
 *     "totalCount": int  // 챕터 내 총 active 질문 수
 *   }
 *
 * 단일 언어 정책 (Step 1d/1e):
 *   책의 language (LEFT JOIN blueprint_samples, fallback 'ko') 키로만 저장.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { genId, countActiveQuestions } from '@/lib/bookStructure';

const MIN_COUNT = 1;
const MAX_COUNT = 20;
export const maxDuration = 30;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, chId } = await params;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const items = Array.isArray(body?.questions) ? body.questions : null;
  if (!items || items.length < MIN_COUNT) {
    return Response.json(
      { error: 'questions (non-empty array) required' },
      { status: 400 }
    );
  }
  if (items.length > MAX_COUNT) {
    return Response.json(
      { error: `cannot bulk-insert more than ${MAX_COUNT} questions`, given: items.length },
      { status: 400 }
    );
  }

  // 각 항목 정규화 + 검증
  const cleaned = [];
  for (const it of items) {
    const prompt = String(it?.prompt || '').trim();
    if (!prompt) {
      return Response.json(
        { error: 'each question must have non-empty prompt' },
        { status: 400 }
      );
    }
    const hint = it?.hint ? String(it.hint).trim() : null;
    cleaned.push({ prompt, hint });
  }

  const db = createDb();
  try {
    // 책 소유 검증 + language derive
    const bookRes = await db.query(
      `SELECT structure, language FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const bookLang = bookRes.rows[0].language || 'ko';
    const structure = bookRes.rows[0].structure || { chapters: [] };

    const chapter = (structure.chapters || []).find(c => c.id === chId);
    if (!chapter) return Response.json({ error: 'chapter not found' }, { status: 404 });
    if (!Array.isArray(chapter.questions)) chapter.questions = [];

    // newQuestion 객체 N개 생성
    const newQuestions = cleaned.map((it) => ({
      id:                genId('q-gen'),
      order:             0, // 아래서 재계산
      prompt:            { [bookLang]: it.prompt },
      hint:              it.hint ? { [bookLang]: it.hint } : null,
      estimated_minutes: 5,
      is_optional:       false,
      is_active:         true,
      is_custom:         true,
    }));

    // chapter.questions[] 끝에 모두 push + order 재계산
    chapter.questions.push(...newQuestions);
    chapter.questions.forEach((q, i) => { q.order = i + 1; });

    // user_book_responses 에 N 행 multi-row INSERT
    //   placeholder: ($1, $2, $3), ($1, $2, $4), ($1, $2, $5), ...
    //   bookId=$1, userId=$2, question_id 들 = $3, $4, $5, ...
    const placeholders = newQuestions
      .map((_, i) => `($1, $2, $${i + 3})`)
      .join(', ');
    const args = [bookId, user.id, ...newQuestions.map(q => q.id)];
    await db.query(
      `INSERT INTO user_book_responses (book_id, user_id, question_id) VALUES ${placeholders}`,
      args
    );

    // structure JSONB UPDATE — atomic 핵심
    const totalQuestions = countActiveQuestions(structure);
    await db.query(
      `UPDATE user_books
          SET structure       = $1::jsonb,
              total_questions = $2,
              last_active_at  = NOW()
        WHERE id = $3 AND user_id = $4`,
      [JSON.stringify(structure), totalQuestions, bookId, user.id]
    );

    console.log(
      `[POST /chapter/${chId}/question/bulk] user=${user.id} bookId=${bookId} ` +
      `inserted=${newQuestions.length} lang=${bookLang} total=${totalQuestions}`
    );

    return Response.json({
      ok: true,
      questions: newQuestions,
      totalCount: chapter.questions.length,
    });
  } catch (e) {
    console.error('[POST /api/book/[id]/chapter/[chId]/question/bulk]', e?.message);
    return Response.json(
      { error: 'bulk insert failed', detail: e?.message },
      { status: 500 }
    );
  }
}
