/**
 * Cloud-based Fragment generation via Gemini Flash.
 *
 * Called from app/api/chat/end/route.js after session end.
 * Returns a normalised Fragment JSON with strict anti-hallucination rules.
 *
 * ROOT-CAUSE NOTES (why this used to fail on Vercel):
 *   1. gemini-2.5-flash is a THINKING model — it burns output tokens on
 *      internal reasoning before emitting JSON. With maxOutputTokens=2048
 *      and no thinking_config, the visible JSON got truncated mid-string.
 *      Fix: thinking_config.thinking_budget=0 + maxOutputTokens=4096.
 *   2. Gemini sometimes wraps JSON in ```json ... ``` fences. We strip those.
 *   3. If finishReason=MAX_TOKENS we still try to repair/extract the partial.
 */

const GEMINI_MODEL = 'gemini-2.5-flash';

const { logApiUsage } = require('./apiUsage');

async function generateFragmentCloud({
  elements, transcript, lang = 'ko', apiKey,
  db = null, userId = null, sessionId = null,  // 🆕 usage logging
}) {
  const tag = '[generateFragmentCloud]';

  if (!apiKey) {
    console.error(`${tag} Missing GEMINI_API_KEY`);
    return null;
  }
  if (!Array.isArray(transcript) || transcript.length === 0) {
    console.error(`${tag} Empty transcript`);
    return null;
  }

  const userMessages = transcript
    .filter(m => m.role === 'user')
    .map(m => (m.content || m.text || '').trim())
    .filter(Boolean);

  if (userMessages.length === 0) {
    console.error(`${tag} No user messages in transcript`);
    return null;
  }

  const normLang = (lang || 'ko').toLowerCase();
  const userLabel = normLang === 'ko' ? '사용자' : normLang === 'es' ? 'Usuario' : 'User';

  const conversationText = transcript
    .map(m => `${m.role === 'user' ? userLabel : 'Emma'}: ${(m.content || m.text || '').trim()}`)
    .filter(s => s.length > (userLabel.length + 3))
    .join('\n');

  const userMessagesText = userMessages
    .map((m, i) => `${i + 1}. "${m}"`)
    .join('\n');

  const prompt = buildFragmentPrompt({
    elements: elements || {},
    conversationText: conversationText.slice(0, 4000),
    userMessagesText,
    lang: normLang,
  });

  console.log(`${tag} calling Gemini — promptLen=${prompt.length} userMsgs=${userMessages.length} lang=${normLang}`);

  try {
    const tReq = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            // camelCase is the v1beta canonical form — forces strict JSON output.
            responseMimeType: 'application/json',
            temperature: 0.3,
            maxOutputTokens: 4096,          // headroom for Korean (≈2 tokens/char)
            // Disable chain-of-thought reasoning — otherwise the thinking model
            // burns the output budget internally and truncates the JSON payload.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`${tag} Gemini API ${res.status} after ${Date.now() - tReq}ms:`, errText.slice(0, 400));
      if (db && userId) {
        await logApiUsage(db, {
          userId, sessionId,
          provider: 'gemini',
          model: GEMINI_MODEL,
          operation: 'fragment_gen',
          latencyMs: Date.now() - tReq,
          success: false,
          errorCode: `http_${res.status}`,
        });
      }
      return null;
    }

    const data = await res.json();
    const cand = data.candidates?.[0];
    const finishReason = cand?.finishReason;
    const rawText = cand?.content?.parts?.[0]?.text || '';
    const usage = data.usageMetadata || {};

    console.log(`${tag} Gemini replied in ${Date.now() - tReq}ms — finishReason=${finishReason} rawLen=${rawText.length} promptTokens=${usage.promptTokenCount} outputTokens=${usage.candidatesTokenCount} thinkingTokens=${usage.thoughtsTokenCount}`);

    if (db && userId) {
      await logApiUsage(db, {
        userId, sessionId,
        provider: 'gemini',
        model: GEMINI_MODEL,
        operation: 'fragment_gen',
        usageMetadata: data.usageMetadata,
        latencyMs: Date.now() - tReq,
        success: true,
      });
    }

    if (!rawText) {
      console.error(`${tag} Empty rawText — finishReason=${finishReason}`);
      return null;
    }

    // ── (B) Explicit MAX_TOKENS handling ─────────────────────────────────────
    // We still attempt the progressive recovery parser below, but warn loudly
    // so it's obvious in logs when truncation is the root cause. If recovery
    // also fails we return null — never surface a half-baked fragment.
    const truncated = finishReason === 'MAX_TOKENS';
    if (truncated) {
      console.error(
        `${tag} ⚠️ Response truncated by MAX_TOKENS ` +
        `(outputTokens=${usage.candidatesTokenCount}, thinkingTokens=${usage.thoughtsTokenCount}). ` +
        `Attempting progressive recovery; will return null if recovery fails.`
      );
    }

    const parsed = parseFragmentJson(rawText, tag);
    if (!parsed) {
      console.error(
        `${tag} parseFragmentJson returned null — finishReason=${finishReason}\n` +
        `  rawHead: ${rawText.slice(0, 200)}\n` +
        `  rawTail: ${rawText.slice(-200)}`
      );
      return null;
    }
    if (truncated) {
      console.warn(`${tag} Recovered partial JSON from MAX_TOKENS response — fragment may be incomplete`);
    }
    if (!parsed.title || !parsed.content) {
      console.error(`${tag} parsed JSON missing title/content:`, JSON.stringify(parsed).slice(0, 300));
      return null;
    }

    return {
      title:        String(parsed.title).slice(0, 200),
      subtitle:     parsed.subtitle ? String(parsed.subtitle).slice(0, 300) : null,
      content:      String(parsed.content),
      tags_era:     toStringArray(parsed.tags_era),
      tags_people:  toStringArray(parsed.tags_people),
      tags_place:   toStringArray(parsed.tags_place),
      tags_theme:   toStringArray(parsed.tags_theme),
      tags_emotion: toStringArray(parsed.tags_emotion),
      // Always a strict boolean — never undefined. `truncated` is declared
      // above as `finishReason === 'MAX_TOKENS'` so it's already bool, but
      // Boolean(...) keeps the contract explicit for downstream consumers.
      truncated:    Boolean(truncated),
    };
  } catch (err) {
    console.error(`${tag} Generation threw:`, err.message, err.stack);
    return null;
  }
}

/**
 * Robust JSON parsing with progressive fallbacks:
 *   1. strip markdown fences
 *   2. plain JSON.parse
 *   3. repair truncated JSON (close unterminated string + object)
 *   4. regex-extract title/subtitle/content from partial text
 */
function parseFragmentJson(rawText, tag = '[parseFragmentJson]') {
  const stripped = stripMarkdownFences(rawText).trim();

  // Attempt 1 — plain parse
  try {
    return JSON.parse(stripped);
  } catch (e1) {
    // Log last 200 chars — the tail is where truncation occurs, so it's
    // strictly more diagnostic than the head for "Unterminated string" errors.
    console.warn(`${tag} plain parse failed: ${e1.message}`);
    console.warn(`${tag} raw tail (last 200): ${stripped.slice(-200)}`);
  }

  // Attempt 2 — repair truncation (close string + object)
  const repaired = repairTruncatedJson(stripped);
  if (repaired) {
    try {
      const parsed = JSON.parse(repaired);
      console.log(`${tag} ✅ recovered via truncation repair`);
      return parsed;
    } catch (e2) {
      console.warn(`${tag} repair parse failed: ${e2.message}`);
    }
  }

  // Attempt 3 — regex extract (last resort)
  const extracted = regexExtractFragment(stripped);
  if (extracted) {
    console.log(`${tag} ⚠️ partial recovery via regex extract — fields: ${Object.keys(extracted).join(',')}`);
    return extracted;
  }

  return null;
}

function stripMarkdownFences(s) {
  // Remove ```json ... ``` or ``` ... ``` wrappers Gemini sometimes emits
  return s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/**
 * Close an unterminated JSON object truncated mid-string.
 * Scans the text, respecting escapes, and appends `"` + necessary `}`s.
 */
function repairTruncatedJson(s) {
  if (!s || s[0] !== '{') return null;

  let inString = false;
  let escaped  = false;
  let depth    = 0;
  let lastGoodEnd = -1; // offset after last `,` or `{` — safe truncation point

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }

  // If complete, caller shouldn't have ended up here.
  if (!inString && depth === 0) return s;

  let fixed = s;
  // Close open string
  if (inString) fixed += '"';
  // Close open objects/arrays
  while (depth-- > 0) fixed += '}';
  return fixed;
}

/**
 * Last-ditch extraction: pull title/subtitle/content via regex
 * from a partial JSON blob.
 */
function regexExtractFragment(s) {
  const pick = (field) => {
    const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, 'i');
    const m = s.match(re);
    if (!m) return null;
    try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
  };

  const title    = pick('title');
  const subtitle = pick('subtitle');
  const content  = pick('content');

  if (!title && !content) return null;

  return {
    title:        title    || '(제목 없음)',
    subtitle:     subtitle || null,
    content:      content  || '',
    tags_era:     [],
    tags_people:  [],
    tags_place:   [],
    tags_theme:   [],
    tags_emotion: [],
  };
}

function toStringArray(v) {
  return Array.isArray(v) ? v.map(String).slice(0, 10) : [];
}

function buildFragmentPrompt({ elements, conversationText, userMessagesText, lang }) {
  const el = elements;
  const elementsBlock = [
    el.when    ? `- WHEN: ${el.when}`       : null,
    el.where   ? `- WHERE: ${el.where}`     : null,
    el.who     ? `- WHO: ${Array.isArray(el.who) ? el.who.join(', ') : el.who}` : null,
    el.what    ? `- WHAT: ${el.what}`       : null,
    el.emotion ? `- EMOTION: ${el.emotion}` : null,
    el.why     ? `- WHY: ${el.why}`         : null,
  ].filter(Boolean).join('\n') || '(none specified)';

  const langLabel =
    lang === 'en' ? 'English' :
    lang === 'es' ? 'Spanish' :
    'Korean';

  const firstPersonHint =
    lang === 'en' ? 'Use first person ("I ...")' :
    lang === 'es' ? 'Use first person ("Yo ...")' :
    'Use first person ("나는 ...")';

  return `You are a careful transcriber who turns a real conversation into a short personal story (Story Fragment).

Write the fragment in ${langLabel}. ${firstPersonHint}.

════════════════════════════════════════════════
🚨 ANTI-HALLUCINATION RULES — READ CAREFULLY
════════════════════════════════════════════════
Your job is to PRESERVE what the user said, not to invent a story around it.

1. ONLY use facts that appear in "USER'S ACTUAL MESSAGES" below. Everything else is off-limits.
2. DO NOT invent places, weather, objects, times of day, or sensory details (smells, sounds, textures, colors) the user did not explicitly mention.
3. DO NOT fabricate dialogue for other people. Do not put words in anyone's mouth.
4. DO NOT add literary ornamentation, metaphors, or poetic flourishes.
5. PRESERVE the user's tone, vocabulary, and speech patterns as closely as you can.
   If the user said "진짜 힘들었어" keep it; don't polish it to "매우 고난스러웠다".
6. If a detail is missing from the user's messages, LEAVE IT OUT.
   A shorter, honest fragment is always better than a longer, embellished one.
7. Emma's messages are CONTEXT ONLY. Do not quote, repeat, or paraphrase Emma.
8. If the user's messages are not enough material for a real story, return a short fragment based only on what they said — do not fill in the gaps with imagination.

════════════════════════════════════════════════
DETECTED STORY ELEMENTS (from prior analysis)
════════════════════════════════════════════════
${elementsBlock}

════════════════════════════════════════════════
USER'S ACTUAL MESSAGES — these are your ONLY source of facts
════════════════════════════════════════════════
${userMessagesText}

════════════════════════════════════════════════
FULL CONVERSATION (Emma's turns are for flow context only, NOT facts)
════════════════════════════════════════════════
${conversationText}

════════════════════════════════════════════════
OUTPUT REQUIREMENTS — BE CONCISE, THIS IS IMPORTANT
════════════════════════════════════════════════
- content length: 300–600 characters STRICT MAX (do not exceed 600)
- First person, reflecting the user's voice
- Conversational, lightly polished for reading
- title: 10–30 chars, evocative but grounded in what the user said
- subtitle: 30–60 chars, one-line summary
- Tags: only include items that appear in user's messages. Use empty arrays if nothing fits.
  - tags_theme pick from: family, love, loss, work, faith, challenge, growth, friendship, identity, food, home, health, migration, education, dream, gratitude

Respond with ONLY valid JSON. No markdown fences, no explanation, no prose before or after.
Start your response with '{' and end with '}'.

{
  "title": "",
  "subtitle": "",
  "content": "",
  "tags_era": [],
  "tags_people": [],
  "tags_place": [],
  "tags_theme": [],
  "tags_emotion": []
}`;
}

module.exports = { generateFragmentCloud, GEMINI_MODEL };
