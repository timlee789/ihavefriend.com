/**
 * API Usage Tracking — 유저별 LLM API 호출 기록
 *
 * 2026-04-23 신설: 유료화 기반 인프라.
 *
 * 사용법:
 *   const { logApiUsage } = require('./apiUsage');
 *   await logApiUsage(db, {
 *     userId, sessionId, provider: 'gemini', model: 'gemini-2.5-flash',
 *     operation: 'chat', usageMetadata: data.usageMetadata, latencyMs, success: true,
 *   });
 *
 * 설계 원칙:
 *  - Fire-and-forget: DB 쓰기 실패해도 throw 안 함
 *  - 단가는 코드 상수: 변경 시 배포로 반영, 과거 기록은 저장 당시 cost 고정
 *  - usageMetadata 필드명은 provider마다 다를 수 있어 normalize 함수로 통일
 */

// ═════════════════════════════════════════════════════════════
// 단가 테이블 (USD per token)
// Gemini: https://ai.google.dev/gemini-api/docs/pricing
// Claude: https://docs.anthropic.com/en/docs/about-claude/models
// ═════════════════════════════════════════════════════════════
const PRICING = {
  // Gemini 2.5 series
  'gemini-2.5-flash':     { input: 0.075 / 1e6, output: 0.30 / 1e6 },
  'gemini-2.5-pro':       { input: 1.25  / 1e6, output: 10.0 / 1e6 },
  'gemini-2.0-flash':     { input: 0.075 / 1e6, output: 0.30 / 1e6 },

  // Embeddings
  'text-embedding-004':   { input: 0.025 / 1e6, output: 0 },
  'gemini-embedding-001': { input: 0.15  / 1e6, output: 0 },  // 2026-04-24 replacement

  // Claude 4 series (B pipeline verification)
  'claude-sonnet-4':      { input: 3.0   / 1e6, output: 15.0 / 1e6 },
  'claude-opus-4':        { input: 15.0  / 1e6, output: 75.0 / 1e6 },

  // 🔥 Task 80b — OpenAI Whisper (audio transcription).
  //   Whisper bills $0.006/min, not per token. We don't have a token
  //   count from the API; in /api/transcribe we approximate output
  //   tokens as text_chars / 4 so the lifetime_tokens_used cache
  //   keeps moving for quota purposes. The cost column is left at 0
  //   for now (per-minute audio cost rolls up via duration in the
  //   logged row); a future cron can backfill cost_usd from
  //   audio_seconds × $0.006/60 when we add audio_seconds tracking.
  'whisper-1':            { input: 0,                output: 0 },
};

/**
 * Gemini usageMetadata 정규화
 *  - Gemini: { promptTokenCount, candidatesTokenCount, totalTokenCount }
 *  - Embedding API: usageMetadata 자체가 없을 수 있음 → 텍스트 길이로 추정
 */
function normalizeUsage(provider, usageMetadata, fallbackTextForEstimate = null) {
  if (usageMetadata) {
    // Gemini format
    const input  = usageMetadata.promptTokenCount     || 0;
    const output = usageMetadata.candidatesTokenCount || 0;
    const total  = usageMetadata.totalTokenCount      || (input + output);
    return { input, output, total };
  }

  // Fallback: estimate from text length (rough, mostly for embedding)
  if (fallbackTextForEstimate) {
    const est = estimateTokens(fallbackTextForEstimate);
    return { input: est, output: 0, total: est };
  }

  return { input: 0, output: 0, total: 0 };
}

/** Rough token estimate (same logic as tokenBudget.js) */
function estimateTokens(text) {
  if (!text) return 0;
  const cjkChars = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length;
  const nonCjkChars = text.length - cjkChars;
  return Math.ceil(nonCjkChars / 4 + cjkChars / 2);
}

/**
 * Main: log one API call to DB.
 * Fire-and-forget — errors are logged but never thrown.
 *
 * @param {Object} db          - Neon db client
 * @param {Object} opts
 * @param {number} opts.userId
 * @param {string} [opts.sessionId]
 * @param {string} opts.provider                    - 'gemini' | 'claude' | 'openai'
 * @param {string} opts.model
 * @param {string} opts.operation                   - 'chat' | 'fragment_gen' | 'memory_extract' | 'embedding' | 'verification' | 'outreach_quiz' | 'outreach_question' | 'fragment_detect'
 * @param {Object} [opts.usageMetadata]             - provider's native usage object
 * @param {string} [opts.fallbackTextForEstimate]   - for embeddings (no native usage)
 * @param {number} [opts.latencyMs]
 * @param {boolean} [opts.success=true]
 * @param {string}  [opts.errorCode]
 */
async function logApiUsage(db, {
  userId, sessionId = null,
  provider, model, operation,
  usageMetadata = null, fallbackTextForEstimate = null,
  latencyMs = null,
  success = true, errorCode = null,
}) {
  try {
    if (!userId) {
      console.warn('[apiUsage] skipped — no userId');
      return;
    }

    const { input, output, total } = normalizeUsage(provider, usageMetadata, fallbackTextForEstimate);
    const price = PRICING[model] || { input: 0, output: 0 };
    const cost  = (input * price.input) + (output * price.output);

    // 단가 테이블에 없는 모델은 경고 (비용이 0으로 기록됨)
    if (!PRICING[model]) {
      console.warn(`[apiUsage] unknown model pricing: ${model} — cost will be 0`);
    }

    // Fire-and-forget: await하되 에러를 삼킴
    await db.query(`
      INSERT INTO api_usage_logs
        (user_id, session_id, provider, model, operation,
         input_tokens, output_tokens, total_tokens, cost_usd,
         success, error_code, latency_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      userId, sessionId, provider, model, operation,
      input, output, total, cost.toFixed(8),
      success, errorCode, latencyMs,
    ]);

    // 🆕 Task 66 — keep lifetime_tokens_used in sync so checkQuota()
    //   answers in a single-row read instead of a SUM scan. Increment is
    //   fire-and-forget; the migration script (scripts/apply-quota-schema.js)
    //   can rebuild from api_usage_logs if a delta is ever missed.
    if (userId && total > 0) {
      db.query(
        `UPDATE "User" SET lifetime_tokens_used = COALESCE(lifetime_tokens_used, 0) + $1 WHERE id = $2`,
        [total, userId]
      ).catch(e => console.warn('[apiUsage] lifetime cache update failed:', e?.message));
    }
  } catch (err) {
    console.error('[apiUsage] log failed (non-fatal):', err.message);
  }
}

module.exports = {
  logApiUsage,
  PRICING,
  estimateTokens,   // re-exported for tests
};
