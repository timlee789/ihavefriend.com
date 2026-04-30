/**
 * GET /api/book/[id]/question/[qId]/suggestions
 *
 * Returns up to 8 free-form fragments (book_id IS NULL) the user
 * could import as the answer to this book question. When there are
 * more than 5 candidates we ask Gemini Flash to rank them by
 * relevance to the question prompt; ≤ 5 we just return the most
 * recent ones unranked. Already-imported and other-book fragments
 * are excluded.
 *
 * Each suggestion is { id, title, preview (200 chars), created_at,
 *                      relevance (0–10|null) }.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

const RANK_THRESHOLD = 5;     // <= this many candidates → skip Gemini
const RANK_TIMEOUT_MS = 10_000;
const FINAL_LIMIT     = 8;

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId, qId } = await params;
  const db = createDb();

  // 🆕 Task 66 — quota gate before the Gemini ranking call.
  {
    const { checkQuota } = require('@/lib/quotaCheck');
    const quota = await checkQuota(db, user.id);
    if (quota.blocked) return Response.json(quota.response, { status: 402 });
  }

  try {
    // 1. Resolve question prompt from the book's structure.
    const bookRes = await db.query(
      `SELECT structure FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    let questionPrompt = null;
    for (const ch of bookRes.rows[0].structure?.chapters || []) {
      const q = (ch.questions || []).find(q => q.id === qId);
      if (q) {
        if (q.prompt && typeof q.prompt === 'object') {
          questionPrompt = q.prompt.ko || q.prompt.en || q.prompt.es || '';
        } else {
          questionPrompt = q.prompt || '';
        }
        break;
      }
    }
    if (!questionPrompt) {
      return Response.json({ error: 'question not found' }, { status: 404 });
    }

    // 2. Already-imported fragments — exclude.
    const respRes = await db.query(
      `SELECT imported_fragment_ids
         FROM user_book_responses
        WHERE book_id = $1 AND question_id = $2`,
      [bookId, qId]
    );
    const alreadyImported = respRes.rows[0]?.imported_fragment_ids || [];

    // 3. Free-form candidates (book_id IS NULL, root only, draft / confirmed).
    //    Excluding the user's already-imported set and any continuation
    //    children (parent_fragment_id IS NOT NULL — those follow their
    //    parent).
    const params2 = [user.id];
    let excludeClause = '';
    if (alreadyImported.length > 0) {
      params2.push(alreadyImported);
      excludeClause = ` AND NOT (id = ANY($${params2.length}::uuid[]))`;
    }
    const candidatesRes = await db.query(
      `SELECT id, title, content, created_at
         FROM story_fragments
        WHERE user_id = $1
          AND book_id IS NULL
          AND parent_fragment_id IS NULL
          AND status IN ('DRAFT', 'CONFIRMED')
          ${excludeClause}
        ORDER BY created_at DESC
        LIMIT 30`,
      params2
    );

    if (candidatesRes.rows.length === 0) {
      return Response.json({ suggestions: [] });
    }

    // 4. Rank with Gemini if we have enough candidates + a key.
    let suggestions = candidatesRes.rows;
    if (candidatesRes.rows.length > RANK_THRESHOLD && process.env.GEMINI_API_KEY) {
      try {
        const ranked = await rankByRelevance(questionPrompt, candidatesRes.rows);
        if (ranked && ranked.length > 0) {
          suggestions = ranked.slice(0, FINAL_LIMIT);
        } else {
          suggestions = candidatesRes.rows.slice(0, FINAL_LIMIT);
        }
      } catch (e) {
        console.warn('[book/suggestions] ranking failed, returning unranked:', e.message);
        suggestions = candidatesRes.rows.slice(0, FINAL_LIMIT);
      }
    } else {
      suggestions = candidatesRes.rows.slice(0, FINAL_LIMIT);
    }

    return Response.json({
      suggestions: suggestions.map(f => ({
        id: f.id,
        title: f.title,
        preview: (f.content || '').substring(0, 200),
        created_at: f.created_at,
        relevance: typeof f.relevance === 'number' ? f.relevance : null,
      })),
    });
  } catch (e) {
    console.error('[GET /api/book/[id]/question/[qId]/suggestions]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

async function rankByRelevance(questionPrompt, fragments) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('no api key');

  const candidates = fragments
    .map((f, i) =>
      `[${i}] ${f.title || '제목 없음'}: ${(f.content || '').substring(0, 150).replace(/\n/g, ' ')}`
    )
    .join('\n');

  const prompt = `사용자가 책 답변용으로 적합한 이야기를 찾고 있어요.

질문: "${questionPrompt}"

이야기 후보들:
${candidates}

각 후보의 관련성을 0~10으로 평가하고, 관련성 높은 순으로 인덱스를 반환하세요.
형식: JSON array of {index, score} (score >= 4인 것만)
예: [{"index":3,"score":9},{"index":0,"score":7}]

JSON만 출력 (설명 없이):`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(RANK_TIMEOUT_MS),
    }
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  let ranking;
  try { ranking = JSON.parse(text); }
  catch { throw new Error('parse failed'); }
  if (!Array.isArray(ranking)) throw new Error('not array');

  return ranking
    .filter(r => r && typeof r.index === 'number' && fragments[r.index])
    .map(r => ({ ...fragments[r.index], relevance: r.score }));
}
