/**
 * lib/emmaDecisionEngine.js  (Stage 2 — Task 89)
 *
 * Standalone decision layer. Consumes Stage-1 analysis + conversation
 * context and returns one of 5 actions for Emma to take next.
 * NOT integrated with /api/chat/turn yet — only /api/chat/decide-test
 * calls this. Stage 3 will wire it in.
 *
 * decideNextAction(input, apiKey)
 *   input: {
 *     mode: 'book' | 'story' | 'companion',
 *     lang: 'ko' | 'en' | 'es',
 *     question: string,
 *     answer:   string,
 *     analysis: <Stage 1 analysis object>,
 *     history?: [{ question, answer }, ...],
 *     previouslyCoveredDimensions?: string[],
 *     lastEmmaAction?: { action, ground_in?, target_dimension? } | null
 *   }
 *   apiKey: GEMINI_API_KEY
 *
 * Returns { decision, validation, raw, latencyMs }.
 */

const { EMMA_DECISION_PROMPT } = require('./emmaDecisionPrompt');

const ALLOWED_ACTIONS = new Set([
  'wait_listen',
  'gentle_nudge',
  'follow_up_specific',
  'acknowledge_only',
  'change_topic',
]);
const ALLOWED_DIMENSIONS = new Set([
  '시작', '동기', '경험', '사람', '감정', '결과', '의미',
]);
const ALLOWED_MODES = new Set(['book', 'story', 'companion']);
const ALLOWED_LANGS = new Set(['ko', 'en', 'es']);

const REQUIRED_KEYS = [
  'action',
  'suggested_response',
  'reasoning',
  'ground_in',
  'target_dimension',
  'confidence',
];

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function buildHistoryBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return '(없음)';
  return history.map((t, i) => {
    const q = (t && t.question) || '';
    const a = (t && t.answer)   || '';
    return `Q${i + 1}: ${q}\nA${i + 1}: ${a}`;
  }).join('\n');
}

function unionPreviouslyCovered(input) {
  if (Array.isArray(input.previouslyCoveredDimensions)) {
    return input.previouslyCoveredDimensions.filter(d => ALLOWED_DIMENSIONS.has(d));
  }
  return [];
}

function assemblePrompt(basePrompt, input) {
  const previouslyCovered = unionPreviouslyCovered(input);
  const historyBlock = buildHistoryBlock(input.history);
  const lastAction = input.lastEmmaAction != null ? input.lastEmmaAction : null;
  return [
    basePrompt,
    '',
    '---',
    '## 실제 입력',
    '',
    `MODE: ${input.mode || ''}`,
    `LANG: ${input.lang || ''}`,
    `QUESTION: ${input.question || ''}`,
    `ANSWER: ${input.answer || ''}`,
    `ANALYSIS: ${JSON.stringify(input.analysis || {})}`,
    `PREVIOUSLY_COVERED: ${JSON.stringify(previouslyCovered)}`,
    `LAST_EMMA_ACTION: ${JSON.stringify(lastAction)}`,
    `HISTORY: ${historyBlock}`,
    '',
    'JSON 한 개만 출력:',
  ].join('\n');
}

function extractJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = raw.substring(start, end + 1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}

function validateDecision(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['decision is not an object'] };
  }
  for (const k of REQUIRED_KEYS) {
    if (!(k in obj)) errors.push(`missing key: ${k}`);
  }
  if ('action' in obj && !ALLOWED_ACTIONS.has(obj.action)) {
    errors.push(`action invalid: ${obj.action}`);
  }
  if ('reasoning' in obj && (typeof obj.reasoning !== 'string' || !obj.reasoning.trim())) {
    errors.push('reasoning must be non-empty string');
  }
  if ('confidence' in obj) {
    const c = obj.confidence;
    if (typeof c !== 'number' || !(c >= 0 && c <= 1)) {
      errors.push(`confidence must be number 0-1, got ${JSON.stringify(c)}`);
    }
  }
  if ('target_dimension' in obj && obj.target_dimension !== null) {
    if (!ALLOWED_DIMENSIONS.has(obj.target_dimension)) {
      errors.push(`target_dimension invalid: ${obj.target_dimension}`);
    }
  }
  if ('ground_in' in obj && obj.ground_in !== null && typeof obj.ground_in !== 'string') {
    errors.push('ground_in must be string or null');
  }
  // suggested_response shape depends on action
  if ('action' in obj && 'suggested_response' in obj) {
    const sr = obj.suggested_response;
    if (obj.action === 'wait_listen') {
      if (sr !== null && sr !== '') {
        errors.push('wait_listen requires suggested_response=null');
      }
    } else {
      if (typeof sr !== 'string' || !sr.trim()) {
        errors.push(`${obj.action} requires non-empty suggested_response`);
      }
    }
  }
  // acknowledge_only must not contain a question mark
  if (obj.action === 'acknowledge_only' && typeof obj.suggested_response === 'string') {
    if (/[?？]/.test(obj.suggested_response)) {
      errors.push('acknowledge_only must not contain a question mark');
    }
  }
  return { valid: errors.length === 0, errors };
}

async function decideNextAction(input, apiKey) {
  if (!apiKey) throw new Error('decideNextAction: missing apiKey');
  if (!input || typeof input.question !== 'string' || typeof input.answer !== 'string') {
    throw new Error('decideNextAction: input.question and input.answer required');
  }
  if (!ALLOWED_MODES.has(input.mode)) {
    throw new Error(`decideNextAction: mode must be book|story|companion, got ${input.mode}`);
  }
  if (!ALLOWED_LANGS.has(input.lang)) {
    throw new Error(`decideNextAction: lang must be ko|en|es, got ${input.lang}`);
  }
  if (!input.analysis || typeof input.analysis !== 'object') {
    throw new Error('decideNextAction: input.analysis (Stage 1 output) required');
  }

  const fullPrompt = assemblePrompt(EMMA_DECISION_PROMPT, input);
  const t0 = Date.now();
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        // Same headroom as Stage 1 follow-up — the response is small
        // (≤ ~250 KO tokens) but reasoning + suggested_response can
        // push it past 600. 1500 is comfortable.
        maxOutputTokens: 1500,
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
  const decision = extractJson(raw);
  // Normalize: empty-string suggested_response on wait_listen -> null
  if (decision && decision.action === 'wait_listen' && decision.suggested_response === '') {
    decision.suggested_response = null;
  }
  const validation = validateDecision(decision);
  return { decision, validation, raw, latencyMs };
}

module.exports = {
  decideNextAction,
  validateDecision,
  ALLOWED_ACTIONS: [...ALLOWED_ACTIONS],
  ALLOWED_DIMENSIONS: [...ALLOWED_DIMENSIONS],
  ALLOWED_MODES: [...ALLOWED_MODES],
  ALLOWED_LANGS: [...ALLOWED_LANGS],
};
