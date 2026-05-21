/**
 * POST /api/architect/generate-questions
 *
 * 챕터 제목 + 설명 + 사용자 언어로 자서전 회상 질문 20개 (기본) 생성.
 * Gemini 2.5 Flash. extract-keywords 의 호출 골격 그대로 차용.
 *
 * Tim 의 product 원칙 (LLM 프롬프트에 강하게 박혀 있음):
 *   답변의 소재를 미리 정의하지 않는다. "한 장면", "한 사건", "풍경",
 *   "한 순간" 같은 표현은 사용자의 답을 형식적으로 한정함. 챕터의 주제
 *   (사람/장소/시기/관계) 만 제시하고 답변 형식은 사용자에게 맡긴다.
 *
 * Body:
 *   {
 *     "chapterTitle":       "어린 시절",        // required, ≤ 100자
 *     "chapterDescription": "어렸을 때의 기억",  // optional
 *     "language":           "ko",              // 'ko' | 'en' | 'es', default 'ko'
 *     "count":              20,                // 1~30, default 20
 *     "existingQuestions":  ["..."]            // optional, ≤ 50, default []
 *   }
 *
 * Response:
 *   {
 *     "questions": [{ "text": "...", "hint": "..." }, ...],
 *     "language":  "ko",
 *     "model":     "gemini-2.5-flash"
 *   }
 *
 * Cost tracking: logApiUsage operation='architect_generate_questions'
 *   model='gemini-2.5-flash'. Fire-and-forget.
 *
 * Quota: lib/quotaCheck.js checkQuota() 게이트. 무거운 출력 (≤2000 토큰)
 *   이므로 무료 사용자가 무한 재생성 못 하도록.
 *
 * 견고성:
 *   - GEMINI_API_KEY 미설정 → 503
 *   - Gemini timeout / 비-200 → 502
 *   - JSON parse 실패 → markdown 스트립 + 배열 rescue (extract-keywords 와 동일)
 *   - 빈 입력 / 너무 긴 입력 / 잘못된 language → 400
 *   - 응답 검증 후 0개 → 502
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

const MAX_CHAPTER_TITLE       = 100;
const MAX_CHAPTER_DESCRIPTION = 500;
const MAX_EXISTING_QUESTIONS  = 50;
const MAX_COUNT               = 30;
const DEFAULT_COUNT           = 20;
const VALID_LANGS             = new Set(['ko', 'en', 'es']);
const MODEL_NAME              = 'gemini-2.5-flash';
const FETCH_TIMEOUT_MS        = 20_000;

export const maxDuration = 30;

function buildSystemPrompt({ language, count, chapterTitle, chapterDescription, existingQuestions }) {
  return `당신은 자서전 챕터에 대한 "이야기 주제 (story topics)" 를 만드는 보조자입니다.

핵심 콘셉 — 질문이 아니라 이야기의 초대:

SayAndKeep 의 핵심 철학은 사용자가 "질문에 답한다" 가 아니라 "주제로 이야기를 들려준다" 입니다. 따라서 생성하는 항목은 단답형 질문 (closed question) 이 아닌 **이야기 주제 (story topic / open-ended story invitation)** 여야 합니다.

- 사용자가 한 주제로 짧은 이야기 (기억, 경험, 회고) 를 들려주도록 초대하는 형식
- 단답으로 끝나는 사실 확인 질문 금지
- 단일 사건 / 한 장면으로 한정하는 표현 금지 (사용자가 자유롭게 풀어낼 수 있도록)

예시 대조:
- ❌ 질문 (closed): "당신의 첫 학교는 어디였습니까?" (한 단어 답)
- ✅ 주제 (story invitation): "처음 학교에 갔던 날 — 그때의 기분과 만난 친구들" (이야기 초대)

핵심 원칙 — 답변의 소재를 제한하지 마세요:

이야기 주제는 챕터의 주제만 제시하고, 사용자가 무엇을 떠올릴지는 자유롭게 선택할 수 있어야 합니다. "한 장면", "한 사건", "풍경", "한 순간", "한 마디" 같은 표현은 답변의 형식을 미리 정의하기 때문에 사용 금지입니다.

GOOD examples (이야기의 초대 — 사용자가 자유롭게 풀어낼 수 있음):
- 어머니에 대한 기억을 들려주세요.
- 어렸을 때 살던 집과 동네에 대해 이야기해주세요.
- 첫 직장에 대해 들려주세요.
- 결혼 생활에서 가장 떠오르는 것은 무엇인가요?
- 아이들이 어렸을 때를 떠올려보세요.
- Tell me about your mother.
- Share whatever comes to mind about your childhood home.
- What stands out about your first job?
- What do you remember most from raising your children?
- Cuéntame sobre tu madre.
- Comparte lo que recuerdes sobre tu hogar de la infancia.
- ¿Qué recuerdas de tu primer trabajo?

BAD examples (절대 사용 금지) — 다음 세 가지 패턴이 답변을 좁힘:

1) Superlative (최상급) 패턴 — "가장 ~한 한 가지" 를 강요:
   - "Who was your closest friend?" — "closest" 가 한 명으로 한정
   - "What was the most fun you had at school?" — "most fun" 이 한 사건으로 한정
   - "Was there a moment you were especially proud of?" — "a moment" 가 한 순간으로 한정
   - "What is your favorite memory of X?" — "favorite" 이 한 기억으로 한정
   - "What was the biggest challenge you faced?" — "biggest" 한정
   - "어머니에 대한 한 장면을 들려주세요" — '한 장면' 한정
   - "가장 친한 친구는 누구였나요" — '가장' 한정
   - "¿Cuál fue tu mejor amigo?" — 'mejor' (best) 한정
   - "¿Cuál fue el momento más feliz?" — 'más feliz' (happiest) 한정

2) Specific fact 패턴 — 한 줄 답으로 끝나는 좁은 사실:
   - "What color was your father's car?" — 한 단어 답
   - "What time did school start?" — 한 단어 답
   - "어머니의 키는 몇이었나요" — 한 단어 답
   - "¿Qué color tenía la casa?" — 한 단어 답

3) Multi-part 패턴 — 여러 좁은 질문이 한 문장에:
   - "Who was your closest friend? How did you meet?" — 두 가지 좁은 질문 합침
   - "What did you eat for breakfast and who cooked it?" — 같은 문제
   - "Where did you live and when did you move?" — 같은 문제

이 모든 패턴 대신 다음 톤으로 만드세요:
- 영어: "Tell me about your friendships in school" / "What do you remember about school days?" / "Share whatever stands out from those years"
- 한국어: "학창 시절 친구들에 대해 들려주세요" / "그때를 떠올려보세요"
- 스페인어: "Cuéntame sobre tus amistades en la escuela" / "Comparte lo que recuerdes de esos años"

규칙:
- 생성하는 항목은 "이야기 주제 (story topic)" — 사용자가 한 주제로 짧은 이야기를 들려주도록 초대.
- 챕터의 주제 (사람/장소/시기/관계) 만 제시. 이야기의 형식/소재는 사용자에게 맡김.
- "어떤", "무엇이", "어떻게" 처럼 답변을 자유롭게 열어두는 의문문 권장.
- 한국어: "~을 들려주세요", "~에 대해 이야기해주세요", "~에 대한 기억", "떠올려보세요" 톤.
- 영어: "Tell me about ...", "Share whatever comes to mind about ...", "What stands out about ...", "What do you remember from ..." 톤. 또는 콜론 패턴 ("The day you first ... — your feelings and ...").
- 스페인어: "Cuéntame sobre ...", "Comparte lo que recuerdes sobre ...", "¿Qué recuerdas de ...?" 톤.
- JSON 배열로만 응답. 마크다운 펜스 (\`\`\`) 사용 금지.
- 주제 길이: 한국어 12~25자, 영어 6~15단어, 스페인어 6~15단어.
- 비슷한 표현 중복 금지. 같은 챕터 안에서 매번 다른 각도로 접근.
- 각 주제에 짧은 hint (10자 이내) 추가 — 사용자가 무엇을 떠올릴지 살짝 가이드. 단, hint 도 너무 좁히면 안 됨.

Target language: ${language}
Target count: ${count}
Chapter title: ${chapterTitle}
Chapter description: ${chapterDescription || '(none)'}
${existingQuestions.length > 0 ? `Avoid duplicating these existing topics: ${existingQuestions.join(' / ')}` : ''}

Output format (JSON array of story topics only):
[{"text": "...", "hint": "..."}, ...]`;
}

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  // ── body validation ──
  const chapterTitle = String(body?.chapterTitle || '').trim();
  if (!chapterTitle) {
    return Response.json({ error: 'chapterTitle required' }, { status: 400 });
  }
  if (chapterTitle.length > MAX_CHAPTER_TITLE) {
    return Response.json(
      { error: `chapterTitle too long (max ${MAX_CHAPTER_TITLE} chars)` },
      { status: 400 }
    );
  }

  const chapterDescription = String(body?.chapterDescription || '').trim().slice(0, MAX_CHAPTER_DESCRIPTION);

  const language = String(body?.language || 'ko').trim();
  if (!VALID_LANGS.has(language)) {
    return Response.json(
      { error: `language must be one of: ${[...VALID_LANGS].join(', ')}` },
      { status: 400 }
    );
  }

  let count = Number.isFinite(body?.count) ? Math.floor(body.count) : DEFAULT_COUNT;
  count = Math.min(MAX_COUNT, Math.max(1, count));

  const existingQuestions = (Array.isArray(body?.existingQuestions) ? body.existingQuestions : [])
    .map(q => String(q || '').trim())
    .filter(Boolean)
    .slice(0, MAX_EXISTING_QUESTIONS);

  // ── quota gate (suggestions endpoint 패턴) ──
  const db = createDb();
  {
    const { checkQuota } = require('@/lib/quotaCheck');
    const quota = await checkQuota(db, user.id);
    if (quota.blocked) return Response.json(quota.response, { status: 402 });
  }

  // ── API key gate ──
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[architect/generate-questions] GEMINI_API_KEY not set');
    return Response.json(
      { error: 'Gemini API not configured' },
      { status: 503 }
    );
  }

  const systemPrompt = buildSystemPrompt({
    language, count, chapterTitle, chapterDescription, existingQuestions,
  });

  const tStart = Date.now();
  let usageMetadata = null;
  let success = false;
  let errorCode = null;
  let questions = [];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: 'Generate the questions now.' }] }],
          generationConfig: {
            temperature: 0.7,
            // 기계적 출력 (질문 리스트) — thinking 불필요. 한국어 응답 truncation
            // 방지를 위해 extract-keywords 와 동일하게 thinkingBudget=0.
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 2000,
            // responseMimeType:'application/json' 은 한국어 응답에서 truncation
            // 유발 (extract-keywords 코멘트 참고). 아래 rescue 로직이 prose
            // preamble 도 처리하므로 strict mimeType 안 씀.
          },
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      errorCode = `gemini_${res.status}`;
      const detail = await res.text().catch(() => '');
      console.error(`[architect/generate-questions] gemini ${res.status}:`, detail.slice(0, 200));
      return Response.json(
        { error: 'question generation failed', detail: `gemini ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    usageMetadata = data?.usageMetadata || null;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Defensive strip + array rescue (extract-keywords 와 동일 패턴).
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
        try {
          const rescue = JSON.parse(stripped.slice(start, end + 1));
          if (Array.isArray(rescue)) parsed = rescue;
        } catch { /* still no good */ }
      }
    }

    if (!Array.isArray(parsed)) {
      errorCode = 'parse_failed';
      console.error('[architect/generate-questions] could not extract array from:', stripped.slice(0, 200));
      return Response.json(
        { error: 'generation returned non-JSON', raw: stripped.slice(0, 200) },
        { status: 502 }
      );
    }

    // 각 원소 검증 — { text, hint } 형식. 잘못된 건 필터링.
    questions = parsed
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const text = String(item.text || '').trim();
        if (!text) return null;
        const hint = String(item.hint || '').trim();
        return { text, hint };
      })
      .filter(Boolean)
      .slice(0, count);

    if (questions.length === 0) {
      errorCode = 'empty_after_validation';
      return Response.json(
        { error: 'generation returned no valid questions' },
        { status: 502 }
      );
    }

    success = true;
  } catch (e) {
    errorCode = e?.name === 'TimeoutError' ? 'timeout' : 'network';
    console.error('[architect/generate-questions] fetch failed:', e?.message);
    return Response.json(
      { error: 'question generation failed', detail: e?.message },
      { status: 502 }
    );
  } finally {
    // ── Cost tracking (fire-and-forget) ──
    const latencyMs = Date.now() - tStart;
    try {
      const { logApiUsage } = require('@/lib/apiUsage');
      logApiUsage(db, {
        userId:    user.id,
        provider:  'gemini',
        model:     MODEL_NAME,
        operation: 'architect_generate_questions',
        usageMetadata,
        fallbackTextForEstimate: success ? null : systemPrompt,
        latencyMs,
        success,
        errorCode,
      }).catch(e => console.warn('[architect/generate-questions] usage log failed:', e?.message));
    } catch (e) {
      console.warn('[architect/generate-questions] usage log threw:', e?.message);
    }
  }

  console.log(
    `[POST /api/architect/generate-questions] user=${user.id} ` +
    `lang=${language} chapter="${chapterTitle}" count=${count} ` +
    `existing=${existingQuestions.length} → ${questions.length} questions`
  );

  return Response.json({
    questions,
    language,
    model: MODEL_NAME,
  });
}
