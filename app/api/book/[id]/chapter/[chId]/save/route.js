/**
 * POST /api/book/[id]/chapter/[chId]/save
 *
 * V3 Milestone 3 Step 2 — Chapter "저장하기" atomic endpoint.
 *
 * 동작:
 *   사용자가 선택한 7개 질문 외 모든 질문을 챕터에서 영구 삭제.
 *   chapter.saved = true 플래그 설정.
 *   preserveAnswers=true (default) → 삭제되는 질문의 답변 fragment 는
 *   story_fragments.book_id=NULL 로 만들어 /my-stories 로 free-form 보존.
 *
 * Body:
 *   {
 *     "keepQuestionIds": ["ch1-q1", "ch1-q3", ...],  // 1~7개
 *     "preserveAnswers": true                         // default true
 *   }
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "chapter": { id, title, saved: true, questions: [...], ... },
 *     "deletedCount":         number,
 *     "preservedFragmentCount": number
 *   }
 *
 * 처리 순서 (V2 가 atomic 트랜잭션 안 쓰는 일관 패턴):
 *   1. requireAuth → user
 *   2. body 파싱 + 검증
 *   3. SELECT structure FROM user_books (owner 검증)
 *   4. chapter 찾기, keepQuestionIds 검증
 *   5. answered 자동 keep 검증 (Tim 의 A+C 결정)
 *   6. 삭제 대상 ID 계산 + fragment_ids 수집
 *   7. structure 메모리 수정 (chapter.questions splice + saved=true)
 *   8. UPDATE user_books SET structure=... — **atomic 핵심 단계, source of truth**
 *   9. UPDATE story_fragments SET book_id=NULL (preserve, best effort)
 *  10. DELETE FROM user_book_responses (best effort, dangling 허용)
 *  11. 200 응답
 *
 * 단계 8 이 성공하면 사용자 입장에서 "저장됨". 9~10 실패 시 fragment/responses
 * 가 dangling 가능 — 향후 cleanup. 8 이전 실패는 사용자 입장에서 변화 없음 (안전).
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { countActiveQuestions } from '@/lib/bookStructure';

const MAX_KEEP = 7;
export const maxDuration = 30;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, chId } = await params;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  // ── body validation ──
  const keepQuestionIds = Array.isArray(body?.keepQuestionIds)
    ? body.keepQuestionIds.map(id => String(id || '').trim()).filter(Boolean)
    : null;
  if (!keepQuestionIds || keepQuestionIds.length === 0) {
    return Response.json({ error: 'keepQuestionIds (non-empty array) required' }, { status: 400 });
  }
  if (keepQuestionIds.length > MAX_KEEP) {
    return Response.json(
      { error: `cannot keep more than ${MAX_KEEP} questions`, given: keepQuestionIds.length },
      { status: 400 }
    );
  }
  const preserveAnswers = body?.preserveAnswers !== false;  // default true

  const db = createDb();
  try {
    // ── 1. 책 소유 검증 + structure 조회 ──
    const bookRes = await db.query(
      `SELECT structure FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const structure = bookRes.rows[0].structure || { chapters: [] };
    if (!Array.isArray(structure.chapters)) structure.chapters = [];

    // ── 2. chapter 찾기 ──
    const chapter = structure.chapters.find(c => c.id === chId);
    if (!chapter) return Response.json({ error: 'chapter not found' }, { status: 404 });
    if (!Array.isArray(chapter.questions)) chapter.questions = [];

    // ── 3. keepQuestionIds 가 모두 chapter.questions 에 존재하는지 ──
    const existingIds = new Set(chapter.questions.map(q => q.id));
    const invalidKeep = keepQuestionIds.filter(id => !existingIds.has(id));
    if (invalidKeep.length > 0) {
      return Response.json(
        { error: 'invalid keep_ids', invalidIds: invalidKeep },
        { status: 400 }
      );
    }

    // ── 4. answered 자동 keep 검증 (Tim 의 A+C 결정 — 클라이언트가 자동 포함하지만 방어용) ──
    //   user_book_responses 에서 status='complete' 인 질문 ID 들 조회
    const answeredRes = await db.query(
      `SELECT question_id FROM user_book_responses
        WHERE book_id = $1 AND status = 'complete'
          AND question_id = ANY($2::text[])`,
      [bookId, chapter.questions.map(q => q.id)]
    );
    const answeredIds = answeredRes.rows.map(r => r.question_id);
    const keepSet = new Set(keepQuestionIds);
    const missingAnswered = answeredIds.filter(id => !keepSet.has(id));
    if (missingAnswered.length > 0) {
      return Response.json(
        { error: 'answered_must_be_kept', missingIds: missingAnswered },
        { status: 400 }
      );
    }

    // ── 5. 삭제 대상 ID 계산 ──
    const deletedIds = chapter.questions
      .map(q => q.id)
      .filter(id => !keepSet.has(id));

    // ── 6. (preserveAnswers 시) 삭제되는 질문들의 fragment_ids 수집 ──
    let allFragmentIds = [];
    if (preserveAnswers && deletedIds.length > 0) {
      const respRes = await db.query(
        `SELECT fragment_ids FROM user_book_responses
          WHERE book_id = $1 AND question_id = ANY($2::text[])`,
        [bookId, deletedIds]
      );
      for (const r of respRes.rows) {
        if (Array.isArray(r.fragment_ids)) allFragmentIds.push(...r.fragment_ids);
      }
    }

    // ── 7. structure 메모리 수정 ──
    chapter.questions = chapter.questions.filter(q => keepSet.has(q.id));
    chapter.questions.forEach((q, i) => { q.order = i + 1; });
    chapter.saved = true;

    const totalQuestions = countActiveQuestions(structure);

    // ── 8. UPDATE user_books — atomic 핵심. 성공하면 "저장됨" ──
    await db.query(
      `UPDATE user_books
          SET structure       = $1::jsonb,
              total_questions = $2,
              completed_questions = (
                SELECT COUNT(*) FROM user_book_responses
                 WHERE book_id = $3 AND status = 'complete'
              ),
              last_active_at  = NOW()
        WHERE id = $3 AND user_id = $4`,
      [JSON.stringify(structure), totalQuestions, bookId, user.id]
    );

    // ── 9. fragment book_id 분리 (preserveAnswers, best effort) ──
    let preservedFragmentCount = 0;
    if (preserveAnswers && allFragmentIds.length > 0) {
      try {
        await db.query(
          `UPDATE story_fragments
              SET book_id = NULL, book_question_id = NULL
            WHERE id = ANY($1::uuid[]) AND user_id = $2`,
          [allFragmentIds, user.id]
        );
        preservedFragmentCount = allFragmentIds.length;
      } catch (e) {
        console.warn(
          `[chapter/save] fragment preserve failed (best effort): ${e?.message}. ` +
          `Book/chapter structure already saved; fragments may stay attached. ` +
          `bookId=${bookId} chId=${chId} count=${allFragmentIds.length}`
        );
      }
    }

    // ── 10. user_book_responses DELETE (best effort, dangling 허용) ──
    if (deletedIds.length > 0) {
      try {
        await db.query(
          `DELETE FROM user_book_responses
            WHERE book_id = $1 AND question_id = ANY($2::text[])`,
          [bookId, deletedIds]
        );
      } catch (e) {
        console.warn(
          `[chapter/save] responses delete failed (best effort): ${e?.message}. ` +
          `Chapter saved with new structure; dangling response rows can be cleaned up later. ` +
          `bookId=${bookId} chId=${chId} count=${deletedIds.length}`
        );
      }
    }

    console.log(
      `[POST /chapter/${chId}/save] user=${user.id} bookId=${bookId} ` +
      `kept=${keepQuestionIds.length} deleted=${deletedIds.length} ` +
      `preserved=${preservedFragmentCount} preserveAnswers=${preserveAnswers}`
    );

    // ── 11. 응답 ──
    return Response.json({
      ok: true,
      chapter: {
        id:          chapter.id,
        order:       chapter.order,
        title:       chapter.title,
        description: chapter.description,
        is_custom:   chapter.is_custom || false,
        saved:       true,
        questions:   chapter.questions,
      },
      deletedCount:           deletedIds.length,
      preservedFragmentCount,
    });
  } catch (e) {
    console.error('[POST /api/book/[id]/chapter/[chId]/save]', e?.message);
    return Response.json(
      { error: 'save failed', detail: e?.message },
      { status: 500 }
    );
  }
}
