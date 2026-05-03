/**
 * lib/emmaAnalysisEngine.js  (Stage 1 — Task 88)
 *
 * Standalone analysis layer for Emma's narrative coverage tracking.
 * NOT integrated with /api/chat/turn — that comes in Stage 2+.
 * Used only by /api/chat/analyze-test for verification.
 *
 * analyzeAnswer(input, apiKey)
 *   input: {
 *     question: string,
 *     answer: string,
 *     history?: Array<{ question, answer }>,
 *     previousAnalyses?: Array<analysis-object>,
 *     previouslyCoveredDimensions?: string[]   // overrides previousAnalyses union
 *   }
 *   apiKey: GEMINI_API_KEY
 *
 * Returns { analysis, validation, raw, latencyMs }.
 *
 * validateAnalysis(obj) returns { valid: boolean, errors: string[] }.
 * Enforces:
 *   - all 7 keys present with correct types
 *   - covered + newly_covered use only the canonical KO dimension labels
 *   - newly_covered ⊆ covered
 *   - answer_depth ∈ {1,2,3}
 *   - user_state ∈ valid set
 */

// 🔥 Task 88 follow-up: prompt is now an inlined JS string constant.
//   The original fs.readFileSync(__dirname/prompts/emma-analysis.txt)
//   broke under Next.js server bundling — __dirname rewrites to /ROOT
//   and the .txt isn't traced into the bundle. Importing the prompt as
//   a module ships the string with the function code, no fs/tracing
//   config needed. Edit lib/emmaAnalysisPrompt.js to iterate.
const { EMMA_ANALYSIS_PROMPT } = require('./emmaAnalysisPrompt');

function loadPrompt() {
  return EMMA_ANALYSIS_PROMPT;
}

const ALLOWED_DIMENSIONS = new Set([
  '시작', '동기', '경험', '사람', '감정', '결과', '의미',
]);
const ALLOWED_USER_STATES = new Set([
  'engaged', 'tired', 'emotional', 'wants_to_continue', 'wants_to_end',
]);

const REQUIRED_KEYS = [
  'covered_dimensions',
  'newly_covered_dimensions',
  'mentioned_details',
  'answer_depth',
  'user_state',
  'ungrounded_topics',
  'answer_summary',
];

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function unionPreviouslyCovered(input) {
  if (Array.isArray(input.previouslyCoveredDimensions)) {
    return input.previouslyCoveredDimensions.filter(d => ALLOWED_DIMENSIONS.has(d));
  }
  if (!Array.isArray(input.previousAnalyses)) return [];
  const out = new Set();
  for (const a of input.previousAnalyses) {
    if (!a || !Array.isArray(a.covered_dimensions)) continue;
    for (const d of a.covered_dimensions) {
      if (ALLOWED_DIMENSIONS.has(d)) out.add(d);
    }
  }
  return [...out];
}

function buildHistoryBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return '(없음)';
  return history.map((t, i) => {
    const q = (t && t.question) || '';
    const a = (t && t.answer)   || '';
    return `Q${i + 1}: ${q}\nA${i + 1}: ${a}`;
  }).join('\n');
}

function assemblePrompt(basePrompt, input) {
  const previouslyCovered = unionPreviouslyCovered(input);
  const historyBlock = buildHistoryBlock(input.history);
  return [
    basePrompt,
    '',
    '---',
    '## 실제 입력',
    '',
    `QUESTION: ${input.question || ''}`,
    `HISTORY: ${historyBlock}`,
    `PREVIOUSLY_COVERED: ${JSON.stringify(previouslyCovered)}`,
    `ANSWER: ${input.answer || ''}`,
    '',
    'JSON 한 개만 출력:',
  ].join('\n');
}

/**
 * Best-effort JSON extractor for when responseMimeType: 'application/json'
 * isn't honored or the model wraps the JSON in extra text.
 */
function extractJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  // Strip ```json ... ``` fences if present.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  // Grab the first balanced { ... } block.
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = raw.substring(start, end + 1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}

function validateAnalysis(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['analysis is not an object'] };
  }
  for (const k of REQUIRED_KEYS) {
    if (!(k in obj)) errors.push(`missing key: ${k}`);
  }
  const arrayKeys = ['covered_dimensions', 'newly_covered_dimensions', 'mentioned_details', 'ungrounded_topics'];
  for (const k of arrayKeys) {
    if (k in obj && !Array.isArray(obj[k])) errors.push(`${k} must be an array`);
  }
  if ('answer_depth' in obj) {
    if (![1, 2, 3].includes(obj.answer_depth)) {
      errors.push(`answer_depth must be 1|2|3, got ${JSON.stringify(obj.answer_depth)}`);
    }
  }
  if ('user_state' in obj) {
    if (!ALLOWED_USER_STATES.has(obj.user_state)) {
      errors.push(`user_state invalid: ${obj.user_state}`);
    }
  }
  if ('answer_summary' in obj && typeof obj.answer_summary !== 'string') {
    errors.push('answer_summary must be a string');
  }
  if (Array.isArray(obj.covered_dimensions)) {
    for (const d of obj.covered_dimensions) {
      if (!ALLOWED_DIMENSIONS.has(d)) errors.push(`covered_dimensions has unknown label: ${d}`);
    }
  }
  if (Array.isArray(obj.newly_covered_dimensions)) {
    for (const d of obj.newly_covered_dimensions) {
      if (!ALLOWED_DIMENSIONS.has(d)) errors.push(`newly_covered_dimensions has unknown label: ${d}`);
    }
    if (Array.isArray(obj.covered_dimensions)) {
      const cset = new Set(obj.covered_dimensions);
      for (const d of obj.newly_covered_dimensions) {
        if (!cset.has(d)) errors.push(`newly_covered_dimensions contains "${d}" not in covered_dimensions`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

async function analyzeAnswer(input, apiKey) {
  if (!apiKey) throw new Error('analyzeAnswer: missing apiKey');
  if (!input || typeof input.question !== 'string' || typeof input.answer !== 'string') {
    throw new Error('analyzeAnswer: input.question and input.answer required');
  }
  const basePrompt = loadPrompt();
  const fullPrompt = assemblePrompt(basePrompt, input);

  const t0 = Date.now();
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  const analysis = extractJson(raw);
  const validation = validateAnalysis(analysis);
  return { analysis, validation, raw, latencyMs };
}

module.exports = {
  analyzeAnswer,
  validateAnalysis,
  ALLOWED_DIMENSIONS: [...ALLOWED_DIMENSIONS],
  ALLOWED_USER_STATES: [...ALLOWED_USER_STATES],
};
