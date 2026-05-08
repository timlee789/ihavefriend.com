/**
 * POST /api/architect/extract-keywords
 *
 * 사용자 발화 → 인생 영역 키워드 (한국어 명사) 추출. Gemini 2.5 Flash.
 * 추출된 키워드는 chapter_library / question_library 의 tags 와 매칭에
 * 사용됨 (다른 architect endpoint 가 먹는 입력).
 *
 * Strategy: STRATEGY-architect-bot-final-2026-05-07.md
 *
 * Body:
 *   { "userText": "어렸을 때 시골에서 보냈어. 농촌에서" }
 *
 * Response:
 *   { "keywords": ["시골", "어린", "농촌"] }
 *
 * Cost tracking: logApiUsage operation='architect_extract_keywords'
 *   model='gemini-2.5-flash'. Fire-and-forget (실패해도 응답에 영향 없음).
 *
 * 견고성:
 *   - GEMINI_API_KEY 미설정 → 503 (다른 endpoint 가 fallback 가능하게 명시)
 *   - Gemini timeout / 비-200 → 502
 *   - Gemini 가 markdown 으로 감싼 JSON 반환할 가능성 대비 strip 처리
 *   - 빈 입력 / 너무 긴 입력 → 400
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

const MAX_USER_TEXT = 4000;
const MAX_KEYWORDS  = 5;
const MODEL_NAME    = 'gemini-2.5-flash';

// 시스템 프롬프트 — strategy 의 §extract-keywords 명세와 1:1.
const SYSTEM_PROMPT = `당신은 사용자의 인생 발화에서 인생 영역 키워드를 추출합니다. 추출된 키워드는 자서전 챕터/질문 라이브러리 매칭에 사용됩니다.

규칙:
- 명사 위주 (장소, 관계, 시기, 활동, 감정)
- 한국어, 일반 명사
- 5개 이내
- JSON 배열로만 반환 (마크다운 X)

예시:
입력: '어렸을 때 시골에서 보냈어'
출력: ["어린", "시골", "농촌"]

입력: '결혼하고 미국 왔지'
출력: ["결혼", "미국", "이민"]`;

export const maxDuration = 30;

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const userText = String(body?.userText || '').trim();
  if (!userText) {
    return Response.json({ error: 'userText required' }, { status: 400 });
  }
  if (userText.length > MAX_USER_TEXT) {
    return Response.json(
      { error: `userText too long (max ${MAX_USER_TEXT} chars)` },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[architect/extract-keywords] GEMINI_API_KEY not set');
    return Response.json(
      { error: 'Gemini API not configured' },
      { status: 503 }
    );
  }

  const tStart = Date.now();
  let usageMetadata = null;
  let success = false;
  let errorCode = null;
  let keywords = [];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0.2,
            // Gemini 2.5 Flash spends "thinking tokens" before the actual
            // output. Even with maxOutputTokens=400, Korean responses
            // were truncating to "[\"" because the budget was being
            // consumed by hidden reasoning steps. Pinning thinkingBudget
            // to 0 forces direct output (this task is mechanical — no
            // reasoning needed).
            // Ref: https://ai.google.dev/gemini-api/docs/thinking
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 200,
            // Note: responseMimeType:'application/json' was set previously
            // but produced inconsistent truncation in Korean responses.
            // The array-rescue logic below handles prose preambles, so
            // we drop the strict mimeType.
          },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!res.ok) {
      errorCode = `gemini_${res.status}`;
      const detail = await res.text().catch(() => '');
      console.error(`[architect/extract-keywords] gemini ${res.status}:`, detail.slice(0, 200));
      return Response.json(
        { error: 'keyword extraction failed', detail: `gemini ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    usageMetadata = data?.usageMetadata || null;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Defensive strip + array rescue.
    //
    // Gemini occasionally ignores responseMimeType:application/json and
    // returns prose ("Here is the JSON requested: [...]") or wraps the
    // array in a ```json fence. We:
    //   1. Strip code fences if present.
    //   2. Try a direct JSON.parse first (the happy path).
    //   3. If that fails, find the FIRST balanced `[...]` substring and
    //      parse just that. This rescues the prose-prefix case without
    //      letting an invalid array through.
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed = null;
    try { parsed = JSON.parse(stripped); }
    catch { /* fall through to array-rescue */ }

    if (!Array.isArray(parsed)) {
      const start = stripped.indexOf('[');
      const end   = stripped.lastIndexOf(']');
      if (start >= 0 && end > start) {
        const slice = stripped.slice(start, end + 1);
        try {
          const rescue = JSON.parse(slice);
          if (Array.isArray(rescue)) parsed = rescue;
        } catch { /* still no good */ }
      }
    }

    if (!Array.isArray(parsed)) {
      errorCode = 'parse_failed';
      console.error('[architect/extract-keywords] could not extract array from:', stripped.slice(0, 200));
      return Response.json(
        { error: 'extraction returned non-JSON', raw: stripped.slice(0, 200) },
        { status: 502 }
      );
    }

    keywords = parsed
      .map(k => String(k || '').trim())
      .filter(Boolean)
      .slice(0, MAX_KEYWORDS);

    success = true;
  } catch (e) {
    errorCode = e?.name === 'TimeoutError' ? 'timeout' : 'network';
    console.error('[architect/extract-keywords] fetch failed:', e?.message);
    return Response.json(
      { error: 'keyword extraction failed', detail: e?.message },
      { status: 502 }
    );
  } finally {
    // ── Cost tracking (fire-and-forget) ──
    const latencyMs = Date.now() - tStart;
    try {
      const { logApiUsage } = require('@/lib/apiUsage');
      const db = createDb();
      logApiUsage(db, {
        userId:    user.id,
        provider:  'gemini',
        model:     MODEL_NAME,
        operation: 'architect_extract_keywords',
        usageMetadata,
        fallbackTextForEstimate: success ? null : userText,
        latencyMs,
        success,
        errorCode,
      }).catch(e => console.warn('[architect/extract-keywords] usage log failed:', e?.message));
    } catch (e) {
      console.warn('[architect/extract-keywords] usage log threw:', e?.message);
    }
  }

  console.log(
    `[POST /api/architect/extract-keywords] user=${user.id} ` +
    `text="${userText.slice(0, 40)}..." → [${keywords.join(',')}]`
  );

  return Response.json({ keywords });
}
