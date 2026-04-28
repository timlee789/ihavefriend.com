/**
 * lib/emmaResponseFilter.js — server-side post-processing for Emma's replies.
 *
 * Personality rules in the system prompt are a *request* to the model,
 * not a guarantee. Tim's beta tests after Task 51/52 showed the model
 * still:
 *   1. asked a question on most turns even with the TYPE A/B 80:20 rule
 *   2. signed off with "Have a good day" / "오늘 잘 보내시길" even with
 *      the explicit goodbye prohibition
 *
 * This filter runs at the boundary where Emma's text becomes part of the
 * conversation transcript. It removes goodbye phrases unconditionally
 * and trims the trailing question sentence on a probabilistic 70% of
 * replies, lowering the question rate from ~75% (observed) toward the
 * intended 20%. The filtered text is what gets stored on the client
 * transcriptRef and passed back to the next turn — so the LLM's own
 * "what I said last turn" context now reflects the trimmed shape, and
 * the model gradually settles into the desired rhythm.
 *
 * The filter is intentionally simple: regex-based, language-aware,
 * deterministic for the goodbye half, randomised for the question half.
 * Fancy detection isn't needed — the patterns are short and stable.
 */

// Goodbye phrases that should never appear in Emma's reply.
// Anchored loosely so common variants are caught. Languages share rules
// because the regex engine doesn't care; we just collect the phrases.
const GOODBYE_PATTERNS = [
  // Korean
  /(?:오늘 )?(?:잘|좋은) 보내(?:시길|세요|십시오)[.!?…]?/g,
  /좋은 하루 (?:되세요|보내세요)[.!?…]?/g,
  /다음(?:에)? (?:또 )?만나(?:요|뵐게요|뵐게요\.)/g,
  /나중에 또 (?:뵐게요|이야기해요|만나요)[.!?…]?/g,
  /안녕히 (?:가세요|계세요)[.!?…]?/g,
  /다음에 또 (?:이야기|얘기)[해할](?:게요|요)[.!?…]?/g,
  /그럼 (?:이만|그럼) [^\n.!?…]{0,30}[.!?…]?/g,

  // English
  /\bhave a (?:good|great|nice|wonderful) (?:day|evening|night|one)\b[^.!?…\n]{0,40}[.!?…]?/gi,
  /\b(?:see|talk to) you (?:next time|later|soon|again)\b[^.!?…\n]{0,40}[.!?…]?/gi,
  /\btake care\b[^.!?…\n]{0,30}[.!?…]?/gi,
  /\buntil next time\b[^.!?…\n]{0,30}[.!?…]?/gi,

  // Spanish
  /\bque tengas (?:un )?(?:buen|buena|gran|lindo) (?:día|tarde|noche)\b[^.!?…\n]{0,40}[.!?…]?/gi,
  /\bhasta (?:la próxima|pronto|luego|mañana)\b[^.!?…\n]{0,40}[.!?…]?/gi,
  /\bcuídate\b[^.!?…\n]{0,30}[.!?…]?/gi,
  /\bnos vemos\b[^.!?…\n]{0,30}[.!?…]?/gi,
];

function stripGoodbyes(text) {
  if (!text) return text;
  let out = text;
  for (const pat of GOODBYE_PATTERNS) {
    out = out.replace(pat, '');
  }
  // Tidy: collapse double-spaces and orphan whitespace introduced by
  // the regex strips.
  out = out.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return out;
}

/**
 * Sentence-aware tail trim. If the LAST sentence ends with a question
 * mark (Latin ? or full-width ？), drop it. Korean often uses no
 * punctuation but ends with "요?" / "까요?" — those still hit because
 * we look for a trailing question mark.
 *
 * Returns { trimmed, didTrim }.
 */
function trimTrailingQuestion(text) {
  if (!text) return { trimmed: text, didTrim: false };
  const trimmed = text.trimEnd();
  // Find the last sentence boundary. Treat ., !, ?, …, 。, ！, ？ as enders.
  const enderRe = /[.!?…。！？]/g;
  let lastBreak = -1;
  let m;
  while ((m = enderRe.exec(trimmed)) !== null) {
    // We want the position one past the last ender that has content before it.
    lastBreak = m.index;
  }
  // No sentence break at all — if the whole thing ends with ? then drop it
  // entirely, otherwise leave alone.
  if (lastBreak === -1) {
    if (/[?？]\s*$/.test(trimmed)) {
      return { trimmed: '', didTrim: true };
    }
    return { trimmed, didTrim: false };
  }
  // The "last sentence" is everything after the second-to-last ender.
  // Walk backwards from the end to find the previous ender so we can
  // slice out just the trailing sentence.
  const prevEnder = (() => {
    enderRe.lastIndex = 0;
    let prev = -1;
    let last = -1;
    while ((m = enderRe.exec(trimmed)) !== null) {
      prev = last;
      last = m.index;
    }
    return prev;
  })();
  const lastSentence = trimmed.slice(prevEnder + 1).trim();
  // Is the last sentence a question?
  if (!/[?？]\s*$/.test(lastSentence)) return { trimmed, didTrim: false };
  // Drop it. Keep everything up to and including the previous ender.
  const head = prevEnder >= 0 ? trimmed.slice(0, prevEnder + 1) : '';
  return { trimmed: head.trim(), didTrim: true };
}

/**
 * Filter Emma's outgoing reply.
 *
 *   filterEmmaResponse(text, { trimQuestionProbability = 0.7 })
 *
 * Returns the filtered string. Empty / falsy input passes through
 * unchanged. The trim probability is configurable so tests can pin it
 * to 0 or 1 deterministically.
 */
function filterEmmaResponse(text, opts = {}) {
  if (!text || typeof text !== 'string') return text || '';
  const trimQuestionProbability = opts.trimQuestionProbability ?? 0.7;

  // Step 1: goodbye phrases — always remove.
  let out = stripGoodbyes(text);
  if (!out) return '';

  // Step 2: probabilistically drop the trailing question sentence so
  //   the rolling question rate falls toward 20–30%.
  const roll = typeof opts.rng === 'function' ? opts.rng() : Math.random();
  if (roll < trimQuestionProbability) {
    const { trimmed, didTrim } = trimTrailingQuestion(out);
    if (didTrim && trimmed.length > 0) out = trimmed;
    // If the trim emptied the reply (Emma sent only a question), leave
    // the original — better a question than dead air.
  }

  return out.trim();
}

module.exports = {
  filterEmmaResponse,
  stripGoodbyes,
  trimTrailingQuestion,
  GOODBYE_PATTERNS,
};
