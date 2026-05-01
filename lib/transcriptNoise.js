/**
 * lib/transcriptNoise.js — STT (Speech-to-Text) noise normalizer
 *
 * Real-world voice input from cars / restaurants / shops drops out
 * of clean speech and into "ASR repetition collapse" — the upstream
 * recogniser falls into a degenerate loop and emits the same word or
 * 2-grams hundreds of times in one user turn:
 *
 *   "어디 어디 어디 어디 어디 어디 …" (×500)
 *   "형이형이형이형이 …"
 *   "deng deng deng deng dengeng …" (cross-language hallucination)
 *
 * One such turn can be ~2000 chars and dominates the 3000–4000 char
 * truncation window used by fragment-detect / generateFragmentCloud,
 * starving the genuine story content of context. Result: a 5-minute
 * conversation with a clear personal story produces zero fragment.
 *
 * This module preprocesses transcripts BEFORE any LLM call so that
 * downstream stages see the user's actual content, not the noise burst.
 *
 *   const { cleanText, cleanTranscript } = require('./transcriptNoise');
 *   const { cleaned, noiseRatio, hadNoise } = cleanTranscript(history);
 *
 * Conservative by design: only collapses RUNS of identical units. Real
 * speech rarely repeats the same token 4+ times in a row.
 */

// Threshold: 4+ consecutive identical units = treat as ASR collapse.
// Genuine human emphasis like "안돼 안돼 안돼" stays (3 ≤ threshold);
// runs at or above threshold collapse to KEEP_REPEATS=1 + ellipsis so
// downstream LLMs see a clear "user said X, then noise" signal rather
// than thinking the user actually emitted multiple copies.
const COLLAPSE_THRESHOLD = 4;
const KEEP_REPEATS       = 1;

// Per-turn safety cap. After collapsing, if a single user/assistant turn
// is still longer than this, that's almost certainly residual noise we
// could not pattern-match. Truncate with a marker so downstream LLMs
// don't get whole-prompt budget consumed by one bad turn.
// 🔥 Task 78 — Tim's 4-minute Korean stories were getting their
// tails chopped off in /my-stories. The 1200-char cap was a safety
// belt against ASR collapse bursts (e.g. "응응응응…" repeated 500
// times), but legitimate uncompressed Korean monologues routinely
// exceed it. The collapse passes above already neutralize burst
// patterns; the cap only fires on whatever survives them. Bump to
// 20000 so a clean 4-minute monologue passes through, and gate the
// cap behind a "looks like legit content" check so we never trim
// dense Hangul / Latin prose that survived collapse simply because
// it WAS clean.
const MAX_TURN_CHARS = 20000;

/**
 * Collapse word-level runs: "어디 어디 어디 어디 어디" → "어디 어디 어디 …".
 * Works for any whitespace-separated repeated token.
 */
function collapseWordRuns(text) {
  if (!text) return text;
  // Match: a word, then >=COLLAPSE_THRESHOLD-1 more occurrences of the
  // same word separated by whitespace.
  const re = new RegExp(`(\\S+)(?:\\s+\\1){${COLLAPSE_THRESHOLD - 1},}`, 'g');
  return text.replace(re, (match, word) => {
    // Keep KEEP_REPEATS instances + ellipsis marker.
    return Array(KEEP_REPEATS).fill(word).join(' ') + ' …';
  });
}

/**
 * Collapse char-level runs: "형이형이형이형이형이" → "형이형이형이…".
 * Catches cases where STT emits no spaces between repeated tokens
 * (common with Korean particles or non-Korean hallucinations).
 *
 * We only consider short patterns (1–8 chars) to avoid accidentally
 * matching legitimate repeated phrases.
 */
function collapseCharRuns(text) {
  if (!text) return text;
  // Lazy match a short pattern, then >=COLLAPSE_THRESHOLD-1 more direct
  // back-to-back occurrences. Use lazy ?,1,8 to prefer shorter cycles
  // (so "형이형이형이" matches with pattern="형이", not "형이형이").
  const re = new RegExp(`(.{1,8}?)\\1{${COLLAPSE_THRESHOLD - 1},}`, 'g');
  return text.replace(re, (match, pat) => {
    return pat.repeat(KEEP_REPEATS) + '…';
  });
}

/**
 * Collapse multilingual hallucination bursts.
 *
 * When ASR loses the audio signal it sometimes emits a stream of short
 * pseudo-words across mixed scripts that aren't pure repetitions —
 * each is slightly different ("Maga ' Magarig ' dengenge dengeng deng
 * 'un 'Ni 'n 'n 'n …"). These bursts share characteristics:
 *   • mostly short tokens (≤ 6 chars)
 *   • few or no full Korean Hangul syllables (U+AC00–U+D7A3)
 *   • lots of apostrophes / Latin/Arabic remnants
 *
 * We slide a window and replace dense runs of such tokens with a single
 * marker. Conservative: requires ≥ 6 consecutive matches, so a real
 * Korean sentence with one borrowed Latin word survives.
 */
function collapseHallucinationBursts(text) {
  if (!text) return text;
  // Token = run of non-whitespace
  const tokens = text.split(/(\s+)/);  // keep whitespace separators
  const isWord = (t) => /\S/.test(t);
  const isHallucinationToken = (t) => {
    if (!isWord(t)) return false;
    // Strip punctuation for the check
    const core = t.replace(/[\s.,!?…'"`'""()\[\]]/g, '');
    if (core.length === 0) return true;          // pure punctuation = noise
    if (core.length > 6) return false;           // long tokens = real words
    // Has any Korean Hangul syllable? → real Korean
    if (/[가-힣]{2,}/.test(core)) return false;
    // Has any common English word shape (≥3 latin letters with vowel)?
    if (/^[A-Za-z]{3,}$/.test(core) && /[aeiouAEIOU]/.test(core)) {
      // Could be "the", "and", "yes" — keep
      return false;
    }
    return true;
  };

  const out = [];
  let i = 0;
  const MIN_BURST = 6;
  while (i < tokens.length) {
    if (!isWord(tokens[i])) { out.push(tokens[i]); i++; continue; }
    // Count consecutive hallucination tokens (skipping whitespace)
    let j = i;
    let count = 0;
    while (j < tokens.length) {
      if (!isWord(tokens[j])) { j++; continue; }
      if (!isHallucinationToken(tokens[j])) break;
      count++;
      j++;
    }
    if (count >= MIN_BURST) {
      out.push('[음성 인식 잡음]');
      // Skip past the burst (j currently points one past the last hallucination token)
      i = j;
    } else {
      out.push(tokens[i]);
      i++;
    }
  }
  return out.join('');
}

/**
 * 🔥 Task 78 — distinguish real prose from noise that slipped past
 * the collapse passes. If a turn looks like legitimate content we
 * skip the cap entirely; the cap only catches turns that smell like
 * residual ASR garbage. Three independent signals, any one is enough:
 *   1. Hangul-syllable density ≥ 50% — Korean monologues.
 *   2. Latin letters with vowels ≥ 50% — English / Spanish prose.
 *      (Vowel ratio rules out long sequences of consonants which
 *       are typical of ASR repetition collapse like "ng ng ng…".)
 *   3. The collapse pipeline didn't shorten the input at all
 *      (text === collapsed) — meaning none of the burst detectors
 *      fired, so by definition there's nothing to cut.
 */
function looksLikeLegitContent(text, originalLength) {
  if (!text) return false;
  // Signal 3 — collapse made no edits; trust the input.
  if (typeof originalLength === 'number' && originalLength === text.length) {
    return true;
  }
  const len = text.length;
  if (len === 0) return false;

  // Signal 1 — Hangul syllable density.
  const hangul = (text.match(/[가-힯]/g) || []).length;
  if (hangul / len >= 0.50) return true;

  // Signal 2 — Latin letters with vowels (English / Spanish).
  const latinLetters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const vowels       = (text.match(/[AEIOUaeiouÁÉÍÓÚáéíóúÑñ]/g) || []).length;
  if (latinLetters / len >= 0.50 && vowels / latinLetters >= 0.20) return true;

  return false;
}

/**
 * Cap a single turn's length after compression. If a user turn stays
 * implausibly long (>MAX_TURN_CHARS) even after collapsing, the tail
 * is almost certainly residual noise. Keep the head, mark the truncation.
 */
function capTurnLength(text, originalLength) {
  if (!text) return text;
  if (text.length <= MAX_TURN_CHARS) return text;
  // Task 78 — bypass the cap for legit prose that happens to be long.
  if (looksLikeLegitContent(text, originalLength)) return text;
  return text.slice(0, MAX_TURN_CHARS) + ' …[잘림: 음성 인식 잡음 가능성]';
}

/**
 * Clean a single text turn.
 * Order matters: word-level first (cheap, common), then char-level
 * (catches no-space variants), then length cap.
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') return text || '';
  const originalLength = text.length;
  let out = text;
  out = collapseWordRuns(out);
  out = collapseCharRuns(out);
  out = collapseHallucinationBursts(out);
  out = capTurnLength(out, originalLength);
  return out;
}

/**
 * Clean a transcript (array of {role, content} or {role, text}).
 *
 * Returns:
 *   {
 *     cleaned:      same shape as input, with each turn's content cleaned,
 *     originalLen:  total char count of input contents,
 *     cleanedLen:   total char count after cleaning,
 *     noiseRatio:   (originalLen - cleanedLen) / originalLen, in [0, 1],
 *     hadNoise:     true if at least one turn was modified,
 *     userTurnsKept: count of user turns with >= 30 cleaned chars (signal),
 *   }
 */
function cleanTranscript(history) {
  if (!Array.isArray(history)) {
    return { cleaned: [], originalLen: 0, cleanedLen: 0, noiseRatio: 0, hadNoise: false, userTurnsKept: 0 };
  }

  let originalLen = 0;
  let cleanedLen  = 0;
  let hadNoise    = false;
  let userTurnsKept = 0;

  const cleaned = history.map(m => {
    const original = (m.content ?? m.text ?? '');
    originalLen += original.length;

    const cleanedContent = cleanText(original);
    cleanedLen += cleanedContent.length;

    if (cleanedContent !== original) hadNoise = true;
    if (m.role === 'user' && cleanedContent.length >= 30) userTurnsKept++;

    // Preserve original key (content vs text) for backward compat.
    if ('content' in m) return { ...m, content: cleanedContent };
    if ('text' in m)    return { ...m, text: cleanedContent };
    return { ...m, content: cleanedContent };
  });

  const noiseRatio = originalLen > 0
    ? Math.max(0, (originalLen - cleanedLen) / originalLen)
    : 0;

  return { cleaned, originalLen, cleanedLen, noiseRatio, hadNoise, userTurnsKept };
}

// ─── Real-time burst detection (Task 47 #2) ──────────────────
//
// Used by the chat client to flag a *streaming* user transcript chunk
// that has fallen into ASR repetition collapse. Cheap and synchronous
// so it can run on every inputTranscription update without lag.
//
// Returns { hit: bool, unit: string|null, repeats: int }
// hit=true means the same word/2-gram has appeared ≥ COLLAPSE_THRESHOLD
// times consecutively in the LAST window of the text — i.e. the burst
// is happening RIGHT NOW, not earlier in the same turn.

function detectBurst(text) {
  if (!text || typeof text !== 'string') return { hit: false, unit: null, repeats: 0 };
  // Look only at the last ~120 chars — burst-in-progress lives in the tail.
  const tail = text.length > 120 ? text.slice(-120) : text;
  const tokens = tail.split(/\s+/).filter(Boolean);
  if (tokens.length < COLLAPSE_THRESHOLD) {
    // Maybe no spaces at all — try char-cycle check on tail
    const m = /(.{1,8}?)\1{3,}$/.exec(tail);
    if (m) {
      const cycleLen = m[1].length;
      const totalLen = m[0].length;
      return { hit: true, unit: m[1], repeats: Math.floor(totalLen / cycleLen) };
    }
    return { hit: false, unit: null, repeats: 0 };
  }
  // 1-gram repeat at the end
  let last = tokens[tokens.length - 1];
  let k = 1;
  for (let i = tokens.length - 2; i >= 0 && tokens[i] === last; i--) k++;
  if (k >= COLLAPSE_THRESHOLD) return { hit: true, unit: last, repeats: k };
  // 2-gram repeat at the end
  if (tokens.length >= 2 * COLLAPSE_THRESHOLD) {
    const a = tokens[tokens.length - 2];
    const b = tokens[tokens.length - 1];
    let p = 1;
    for (let i = tokens.length - 4; i >= 0; i -= 2) {
      if (tokens[i] === a && tokens[i + 1] === b) p++;
      else break;
    }
    if (p >= COLLAPSE_THRESHOLD) return { hit: true, unit: `${a} ${b}`, repeats: p };
  }
  return { hit: false, unit: null, repeats: 0 };
}

/**
 * Retrospective burst check over the WHOLE turn (not just tail).
 * Used by server-side telemetry to count user turns that contained a
 * burst at any point — even if the user kept talking after.
 */
function hadBurst(text) {
  if (!text || typeof text !== 'string') return false;
  // 1-gram run anywhere
  const w1 = new RegExp(`(\\S+)(?:\\s+\\1){${COLLAPSE_THRESHOLD - 1},}`);
  if (w1.test(text)) return true;
  // 2-gram run anywhere
  const w2 = new RegExp(`(\\S+\\s+\\S+)(?:\\s+\\1){${COLLAPSE_THRESHOLD - 1},}`);
  if (w2.test(text)) return true;
  // Char-cycle anywhere
  const c = new RegExp(`(.{1,8}?)\\1{${COLLAPSE_THRESHOLD - 1},}`);
  return c.test(text);
}

// ─── Smart conversation sampling (Task 47 #5) ────────────────
//
// Replaces the brittle `substring(0, 3000)` truncation used by
// fragment-detect. Goals:
//   - Keep total budget under `maxChars`
//   - Prioritise USER turns (story content lives in user voice)
//   - Drop or shorten turns that are mostly noise after cleaning
//   - Preserve conversational shape (pair user turns with their
//     surrounding assistant prompt where possible)
//
// Input: history = array of {role, content|text} (already cleaned via
// cleanTranscript, ideally). The function uses cleaned content if no
// noise is detected, otherwise falls back to first MAX_TURN_CHARS.
//
// Output: a string formatted "사용자: …\nEmma: …\n…"

function buildConversationSample(history, {
  maxChars = 4000,
  userLabel = '사용자',
  assistantLabel = 'Emma',
} = {}) {
  if (!Array.isArray(history) || history.length === 0) return '';

  // Score every turn for "story signal density". Low score = drop first.
  const turns = history.map((m, idx) => {
    const text = (m.content ?? m.text ?? '').trim();
    return {
      idx,
      role: m.role,
      text,
      isUser: m.role === 'user',
      // Length AFTER cleanText — the real-content estimate
      cleanedLen: cleanText(text).length,
      rawLen: text.length,
    };
  });

  // Greedy fill: walk turns in DOCUMENT order but skip a turn if adding
  // it would exceed budget AND it has lower priority than already-included.
  // For simplicity and predictability, just walk forward and budget-cap.
  const out = [];
  let used = 0;
  for (const t of turns) {
    if (!t.text) continue;
    const label = t.isUser ? userLabel : assistantLabel;
    // Budget-cap THIS turn: per-turn ceiling so one giant turn can't
    // crowd out the rest.
    const perTurnCeiling = Math.min(t.text.length, Math.floor(maxChars * 0.4));
    const piece = t.text.length > perTurnCeiling
      ? t.text.slice(0, perTurnCeiling) + ' …'
      : t.text;
    const line = `${label}: ${piece}`;
    if (used + line.length + 1 > maxChars) {
      // Out of budget — keep going only if this is a USER turn we haven't
      // captured yet and we have ANY headroom (>=200 chars).
      if (t.isUser && (maxChars - used) > 200) {
        const truncated = `${label}: ${piece.slice(0, maxChars - used - label.length - 5)} …`;
        out.push(truncated);
        used += truncated.length + 1;
      }
      break;
    }
    out.push(line);
    used += line.length + 1;
  }
  return out.join('\n');
}

module.exports = {
  cleanText,
  cleanTranscript,
  detectBurst,
  hadBurst,
  buildConversationSample,
  // exposed for tests / tuning
  COLLAPSE_THRESHOLD,
  KEEP_REPEATS,
  MAX_TURN_CHARS,
};
