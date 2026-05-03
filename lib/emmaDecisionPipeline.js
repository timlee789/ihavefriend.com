/**
 * lib/emmaDecisionPipeline.js  (Stage 3 — Task 90)
 *
 * Background pipeline that ties Stage 1 (analyze) + Stage 2 (decide)
 * to the live conversation. Runs from /api/chat/turn's IIFE so user-
 * facing latency is unaffected. Persists everything to emma_decisions
 * for monitoring; the consumer endpoint /api/emma/next-response feeds
 * EmmaChat.
 *
 * Hard rules:
 *   - Feature flag (process.env.EMMA_DECISION_ENGINE_ENABLED='true')
 *     gates the entire pipeline. Default OFF — zero production impact
 *     until Tim flips it.
 *   - All failures swallow with console.warn — never throw upward
 *     into chat/turn (it's already responded by the time we run).
 *   - mapMode: STORY → 'book', COMPANION → 'companion', AUTO/anything
 *     else → 'companion' (safer default — narrative push is opt-in).
 *
 * Schema dependency: scripts/apply-emma-decisions-migration.js must
 * have been applied. Pipeline gracefully no-ops if the table is
 * missing (try/catch around every write).
 */

const { analyzeAnswer } = require('./emmaAnalysisEngine');
const { decideNextAction, ALLOWED_DIMENSIONS } = require('./emmaDecisionEngine');

const ALLOWED_DIMENSIONS_SET = new Set(ALLOWED_DIMENSIONS);

function isEnabled() {
  return process.env.EMMA_DECISION_ENGINE_ENABLED === 'true';
}

function mapMode(conversationMode) {
  // chat_sessions.conversation_mode is the Prisma enum
  // (AUTO | COMPANION | STORY) returned uppercase.
  switch ((conversationMode || '').toUpperCase()) {
    case 'STORY':     return 'book';
    case 'COMPANION': return 'companion';
    default:          return 'companion';
  }
}

function normalizeLang(lang) {
  const l = (lang || 'ko').toString().toLowerCase();
  return ['ko', 'en', 'es'].includes(l) ? l : 'ko';
}

/**
 * Build a Q/A history from the chat_sessions.transcript_data column.
 * The transcript is an array of { role: 'user'|'assistant', content }
 * entries appended in turn-order. We pair user→assistant turns and
 * keep the most recent N pairs so the decision prompt sees a window
 * of context without paying for the whole session.
 */
function buildHistoryFromTranscript(transcript, maxPairs = 5) {
  if (!Array.isArray(transcript) || transcript.length === 0) return [];
  const pairs = [];
  let pendingUser = null;
  for (const t of transcript) {
    if (!t || !t.content) continue;
    if (t.role === 'user') {
      pendingUser = t.content;
    } else if (t.role === 'assistant') {
      pairs.push({
        question: t.content,
        answer:   pendingUser || '',
      });
      pendingUser = null;
    }
  }
  // The decision engine expects { question, answer } where question
  // is what Emma asked and answer is the user's reply. The transcript
  // pairing above flips that — re-pair properly:
  const cleaned = [];
  let lastEmma = null;
  for (const t of transcript) {
    if (!t || !t.content) continue;
    if (t.role === 'assistant') {
      lastEmma = t.content;
    } else if (t.role === 'user') {
      if (lastEmma) {
        cleaned.push({ question: lastEmma, answer: t.content });
        lastEmma = null;
      }
    }
  }
  return cleaned.slice(-maxPairs);
}

/**
 * Merge a turn's newly_covered_dimensions into the running coverage.
 * Stored as a deduped array on chat_sessions.dimension_coverage.
 */
function mergeCoverage(prev, newlyCovered) {
  const out = new Set();
  if (Array.isArray(prev)) {
    for (const d of prev) if (ALLOWED_DIMENSIONS_SET.has(d)) out.add(d);
  }
  if (Array.isArray(newlyCovered)) {
    for (const d of newlyCovered) if (ALLOWED_DIMENSIONS_SET.has(d)) out.add(d);
  }
  return [...out];
}

/**
 * Pull the most recent Emma utterance from the transcript so the
 * decision engine's `question` argument is always meaningful, even on
 * the very first user turn. Returns the literal previous Emma line,
 * or '(첫 turn)' / '(first turn)' when there isn't one yet.
 */
function extractPreviousQuestion(transcript, lang) {
  if (Array.isArray(transcript)) {
    for (let i = transcript.length - 1; i >= 0; i--) {
      const t = transcript[i];
      if (t?.role === 'assistant' && t.content) return t.content;
    }
  }
  if (lang === 'en') return '(first turn)';
  if (lang === 'es') return '(primer turno)';
  return '(첫 turn)';
}

/**
 * Persist a finished analyze+decide cycle. All writes are best-effort;
 * the table is wrapped in try/catch so a missing migration doesn't
 * surface as an error in chat/turn logs.
 */
async function persistDecision(db, params, analysis, decision, latencies) {
  try {
    await db.query(
      `INSERT INTO emma_decisions
         (session_id, user_id, turn_number, analysis, decision,
          action, suggested_response, analysis_ms, decision_ms)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)`,
      [
        params.sessionId,
        params.userId,
        params.turnNumber,
        JSON.stringify(analysis || null),
        JSON.stringify(decision || null),
        decision?.action || null,
        decision?.suggested_response || null,
        latencies.analysisMs,
        latencies.decisionMs,
      ]
    );
  } catch (e) {
    console.warn('[emmaPipeline] persistDecision failed (table missing?):', e.message);
  }
}

async function updateSessionCoverage(db, sessionId, newCoverage, lastAction) {
  try {
    await db.query(
      `UPDATE chat_sessions
          SET dimension_coverage = $1::jsonb,
              last_emma_action   = $2::jsonb
        WHERE id = $3`,
      [
        JSON.stringify(newCoverage || []),
        JSON.stringify(lastAction || null),
        sessionId,
      ]
    );
  } catch (e) {
    console.warn('[emmaPipeline] updateSessionCoverage failed:', e.message);
  }
}

/**
 * runDecisionEngine — the single entrypoint chat/turn calls.
 *
 * params: {
 *   db, apiKey, userId, sessionId, turnNumber,
 *   userMessage,                  // the user's latest answer (raw text)
 *   conversationMode, lang,       // from chat_sessions
 *   transcript,                   // chat_sessions.transcript_data JSONB
 *   previousCoverage,             // chat_sessions.dimension_coverage JSONB
 *   lastEmmaAction,               // chat_sessions.last_emma_action JSONB
 * }
 *
 * Resolves to { ok, action?, skipped? } — never throws. On error or
 * disabled flag, resolves with { ok: false, skipped: '...' }.
 */
async function runDecisionEngine(params) {
  if (!isEnabled()) {
    return { ok: false, skipped: 'feature flag off' };
  }
  const {
    db, apiKey, userId, sessionId, turnNumber,
    userMessage, conversationMode, lang,
    transcript, previousCoverage, lastEmmaAction,
  } = params;

  if (!apiKey)              return { ok: false, skipped: 'no apiKey' };
  if (!sessionId || !userId) return { ok: false, skipped: 'missing ids' };
  if (!userMessage || !userMessage.trim()) {
    return { ok: false, skipped: 'empty userMessage' };
  }

  const mode = mapMode(conversationMode);
  const normLang = normalizeLang(lang);
  const previousQuestion = extractPreviousQuestion(transcript, normLang);
  const history = buildHistoryFromTranscript(transcript, 5);
  const previouslyCovered = Array.isArray(previousCoverage)
    ? previousCoverage.filter(d => ALLOWED_DIMENSIONS_SET.has(d))
    : [];

  // ── Stage 1: analyze ───────────────────────────────────────────────
  let analysis = null;
  let analysisMs = null;
  try {
    const result = await analyzeAnswer({
      question: previousQuestion,
      answer:   userMessage,
      history,
      previouslyCoveredDimensions: previouslyCovered,
    }, apiKey);
    analysis  = result.analysis;
    analysisMs = result.latencyMs;
    if (!result.validation?.valid) {
      console.warn(`[emmaPipeline] analysis validation failed turn=${turnNumber}:`,
        (result.validation?.errors || []).slice(0, 3).join('; '));
    }
  } catch (e) {
    console.warn(`[emmaPipeline] analyze failed turn=${turnNumber}:`, e.message);
    return { ok: false, skipped: 'analyze error' };
  }
  if (!analysis) {
    return { ok: false, skipped: 'analysis null' };
  }

  // ── Stage 2: decide ────────────────────────────────────────────────
  let decision = null;
  let decisionMs = null;
  try {
    const result = await decideNextAction({
      mode, lang: normLang,
      question: previousQuestion,
      answer:   userMessage,
      analysis,
      history,
      previouslyCoveredDimensions: previouslyCovered,
      lastEmmaAction: lastEmmaAction || null,
    }, apiKey);
    decision   = result.decision;
    decisionMs = result.latencyMs;
    if (!result.validation?.valid) {
      console.warn(`[emmaPipeline] decision validation failed turn=${turnNumber}:`,
        (result.validation?.errors || []).slice(0, 3).join('; '));
    }
  } catch (e) {
    console.warn(`[emmaPipeline] decide failed turn=${turnNumber}:`, e.message);
    // Persist analysis-only so we still see what happened.
    await persistDecision(db, { sessionId, userId, turnNumber }, analysis, null, {
      analysisMs, decisionMs: null,
    });
    return { ok: false, skipped: 'decide error' };
  }

  // ── Persist + update session coverage ──────────────────────────────
  await persistDecision(
    db,
    { sessionId, userId, turnNumber },
    analysis, decision,
    { analysisMs, decisionMs }
  );

  const nextCoverage = mergeCoverage(previousCoverage, analysis.newly_covered_dimensions);
  const nextLastAction = decision ? {
    action: decision.action,
    ground_in: decision.ground_in ?? null,
    target_dimension: decision.target_dimension ?? null,
  } : null;
  await updateSessionCoverage(db, sessionId, nextCoverage, nextLastAction);

  return { ok: true, action: decision?.action || null };
}

module.exports = {
  runDecisionEngine,
  // exposed for unit-style tests / debugging
  mapMode,
  normalizeLang,
  buildHistoryFromTranscript,
  mergeCoverage,
  extractPreviousQuestion,
  isEnabled,
};
