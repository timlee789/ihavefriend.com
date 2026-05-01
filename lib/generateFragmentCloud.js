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
 *
 * 2026-04-24: maxOutputTokens raised to 12288 (Korean ~6000 chars).
 * 2026-04-25: maxOutputTokens raised to 16384 (Korean ~8000 chars,
 *             English ~14000+). Headroom for continuation sessions where
 *             the prompt also includes parent + sibling thread content.
 */

const GEMINI_MODEL = 'gemini-2.5-flash';

const { logApiUsage } = require('./apiUsage');

async function generateFragmentCloud({
  elements, transcript, lang = 'ko', apiKey,
  db = null, userId = null, sessionId = null,  // 🆕 usage logging
  conversationMode = 'auto',                   // 🆕 2026-04-24: 'story' → Q/A semi-interview output
  topicAnchor = null,                          // 🆕 2026-04-24: user-declared session topic
  isContinuation = false,                      // 🆕 2026-04-25: this session continues a previous fragment
  parentTitle = null,                          // 🆕 2026-04-25: title of root fragment being continued
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

  // 🔥 Task 78 diagnostic — log every user turn's length so we can
  //   spot the moment a truncation cap silently lops off a tail.
  console.log(
    `${tag} 📏 user turns lens: [${userMessages.map((s, i) => `t${i}=${s.length}`).join(', ')}] ` +
    `total=${userMessages.reduce((n, s) => n + s.length, 0)}`
  );

  const normLang = (lang || 'ko').toLowerCase();
  const userLabel = normLang === 'ko' ? '사용자' : normLang === 'es' ? 'Usuario' : 'User';

  // 🔥 Task 57 (Fix 1): the previous `conversationText.slice(0, 4000)`
  //   silently dropped the second half of any 5+ minute STORY session.
  //   Tim's "유튜브 시작을 망설이는 이유" fragment was missing the final
  //   two minutes of his account because they fell off the 4000-char
  //   cliff. Replaced with buildConversationSample(maxChars=12000) —
  //   the same sampler we use for fragment-detect. It walks turns in
  //   document order, applies a per-turn ceiling so one giant noisy
  //   message can't crowd out the rest, and prefers user turns when
  //   the budget runs tight. 12000 chars comfortably covers a 10-minute
  //   Korean conversation while staying inside Gemini Flash's input
  //   window. Per-turn ceiling = 0.4 * 12000 = 4800 chars, well above
  //   any realistic single utterance.
  const { buildConversationSample } = require('./transcriptNoise');
  const conversationText = buildConversationSample(transcript, {
    maxChars: 12000,
    userLabel,
    assistantLabel: 'Emma',
  });

  const userMessagesText = userMessages
    .map((m, i) => `${i + 1}. "${m}"`)
    .join('\n');

  const prompt = buildFragmentPrompt({
    elements: elements || {},
    conversationText,                     // 🔥 Task 57 — no longer pre-truncated
    userMessagesText,
    lang: normLang,
    conversationMode,  // 🆕
    topicAnchor,       // 🆕 2026-04-24
    isContinuation,    // 🆕 2026-04-25
    parentTitle,       // 🆕 2026-04-25
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
            // 2026-04-25: raised from 12288 to 16384.
            // Reason: continuation sessions inject parent + sibling threads into the prompt,
            // which leaves less budget for new content. Also Tim observed real interview
            // fragments approaching 1200+ chars and wants headroom for ~2000 chars.
            // 16384 tokens ≈ 8000 Korean chars / 14000 English chars / 13000 Spanish chars.
            // Cost impact: still ~$0.001 per session (well within beta budget).
            maxOutputTokens: 16384,
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

function buildFragmentPrompt({ elements, conversationText, userMessagesText, lang, conversationMode = 'auto', topicAnchor = null, isContinuation = false, parentTitle = null }) {
  const el = elements;
  const isStoryMode = conversationMode === 'story';
  const hasTopic = isStoryMode && topicAnchor && topicAnchor.length >= 2;
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

  const interviewHeader = isStoryMode ? `════════════════════════════════════════════════
🎤 THIS WAS A STRUCTURED INTERVIEW — Emma's questions MATTER
════════════════════════════════════════════════
Emma asked the user questions following an interview framework.
Her questions provide the scaffolding of this story.
Your job is to preserve BOTH the questions (polished) AND the answers (verbatim).

Without the questions, the answers lose context.
Without the answers, the questions have no substance.
Together, they form the complete record.

` : '';

  // 🆕 2026-04-24: Topic Anchor block — forces title/subtitle to respect user's declared topic
  const topicAnchorBlock = hasTopic ? `════════════════════════════════════════════════
🎯 USER'S DECLARED TOPIC — PROTECT THIS
════════════════════════════════════════════════
At the start of this session, the user declared:
  "${topicAnchor}"

THIS IS THE ANCHOR OF THE FRAGMENT.

TITLE & SUBTITLE RULES (STRICT):
- The title MUST reflect this declared topic, not a specific episode within it.
- If the user declared "my store" and during conversation mentioned a specific
  customer's birthday party, the title MUST be about the STORE, not the party.
- Examples:
  Declared: "운영하는 가게"  →  Title: "내가 운영하는 가게 이야기" (✅)
  Declared: "운영하는 가게"  →  Title: "90세 할아버지의 생일 파티" (❌ episode, not topic)
- The subtitle can mention specific episodes as supporting detail,
  but the main frame is the declared topic.

` : '';

  const outputSection = isStoryMode
    ? `════════════════════════════════════════════════
📐 OUTPUT FORMAT — SEMI-INTERVIEW STYLE
════════════════════════════════════════════════

The user was interviewed in STORY MODE. Produce the fragment as a
sequence of question/answer sections, formatted as Markdown.

STRUCTURE:
1. Start with an optional brief intro paragraph IF the user opened
   with context setting (like "오늘은 가게 이야기를 하고 싶어요").
   This intro is the user's own words, very short (1-2 sentences max).
   If the user dove straight into narrative, skip the intro.

2. Then emit a series of Q/A blocks, each shaped like:

   **{polished question (ends with ?)}**

   {user's answer — ~verbatim, preserving their voice}

3. Number of Q/A blocks = number of distinct questions Emma asked
   (excluding pure empathy/filler). Typically 3–7 pairs.

QUESTION POLISHING RULES:
- Take Emma's actual question, strip filler ("아 그러셨어요", "음")
- Make it one clean focused sentence ending in "?"
- Preserve the spirit of what Emma asked — don't invent new questions
- If Emma asked two things, split into two blocks or merge cleanly

ANSWER PRESERVATION RULES:
- Use the user's ACTUAL WORDS, in the order they said them
- Remove pure fillers ("어", "음", "그러니까") and false starts
- Merge duplicated sentences (if user said same thing twice, combine)
- DO NOT summarize, paraphrase, or polish vocabulary
- DO NOT add reflections or meanings the user didn't state
- Preserve casual speech if casual; preserve formal if formal

LENGTH:
- No artificial cap. The fragment should feel as long as the user
  actually spoke. If a user gave 2000 chars of answers, the fragment
  should be ~2500 chars (questions add length).
- Minimum useful fragment: 800 chars total.
- If the user barely spoke (under 300 chars total), that's fine —
  output a small fragment. Don't pad.

EXAMPLE OUTPUT (Korean):

오늘은 제가 운영하는 가게에 대해 이야기하고 싶어요.

**가게를 어떻게 선택하게 되셨나요?**

2년 전에 인수했어요. 많은 고민을 했지만 어느 정도 확신이 있었죠.
이 가게는 잠재력이 많은 가게고, 또 이 가게를 통해서 생활비를 조달할
수 있을 것이라고 생각했어요. 그냥 느낌이었죠. 뭐라고 구체적으로 말할
수는 없지만, 뭔가 엄청나게 좋은 재료들이 있다고 느꼈어요.

**왜 이 서비스를 만드시게 됐나요?**

내가 영어에 그렇게 익숙하지 않아서 손님들과 많은 얘기를 나눌 수가
없었어요. 그래서 만든 것이 지금 이 서비스인 것이죠. 그 손님들의
많은 추억을, 많은 기억들을 남길 수 있는 서비스를 제공하고 싶은 거예요.

(End of example — your actual output should reflect YOUR conversation)

TITLE/SUBTITLE/TAGS (still required):
- title: 10–30 chars, drawn from something the user actually said or clearly emphasized
- subtitle: 30–80 chars, one-line summary using the user's own language
- Tags: only include items actually in user's messages. Empty arrays if nothing fits.
  - tags_theme pick from: family, love, loss, work, faith, challenge, growth, friendship, identity, food, home, health, migration, education, dream, gratitude`
    : `════════════════════════════════════════════════
📐 OUTPUT REQUIREMENTS
════════════════════════════════════════════════
- content length: 800–2500 characters. LONGER IS BETTER when the user said more.
  Short fragments (under 500 chars) are ONLY acceptable if the user really said very little.
  If the user shared a rich story, aim for 1500–2500 characters.
  Do not artificially pad, but do not artificially shorten.
- First person, reflecting the user's exact voice and word choices
- Preserve the user's natural flow — do not reorder or reshape
- title: 10–30 chars, drawn from something the user actually said or clearly emphasized
- subtitle: 30–80 chars, one-line summary using the user's own language
- Tags: only include items actually in user's messages. Empty arrays if nothing fits.
  - tags_theme pick from: family, love, loss, work, faith, challenge, growth, friendship, identity, food, home, health, migration, education, dream, gratitude`;

  return `You are a faithful transcriber whose job is to preserve the user's real life story as closely as possible.

You are NOT a creative writer. You are NOT summarizing. You are NOT polishing.
Think of yourself as a respectful scribe taking down an elder's memoir.

Write the fragment in ${langLabel}. ${firstPersonHint}.

${interviewHeader}${topicAnchorBlock}${isContinuation ? `════════════════════════════════════════════════
🔗 THIS IS A CONTINUATION FRAGMENT
════════════════════════════════════════════════
The user is ADDING to a previously saved story${parentTitle ? ` titled "${parentTitle}"` : ''}.
This fragment must contain ONLY the new content from this session.

STRICT RULES:
- DO NOT repeat or summarize content from the original story.
- The original story remains untouched and lives separately.
- Title should reflect THIS session's added content, not the original.
- If user added a small detail, the fragment can be short — that's fine.
- The fragment will be linked under the original as a thread continuation.

` : ''}════════════════════════════════════════════════
🎯 CORE PHILOSOPHY — Quality of this fragment IS the service
════════════════════════════════════════════════
This fragment will be read by the user and, eventually, by their family.
It may end up in a printed memoir book. It represents a real person's real life.

Your job is FAITHFUL PRESERVATION, not creative retelling.
- If the user spent 5 minutes telling a story, the fragment should feel like 5 minutes of their life.
- If they used simple words, keep simple words.
- If they repeated themselves for emphasis, that repetition matters.
- If they went on a tangent, the tangent is part of who they are.

A fragment that is too short feels dismissive — as if their story wasn't worth much.
A fragment that fabricates details feels dishonest — as if their real story wasn't enough.
Both are failures. The only success is: "Yes, that's what I said. That's my story."

════════════════════════════════════════════════
🚨 ANTI-HALLUCINATION RULES
════════════════════════════════════════════════
1. ONLY use facts that appear in "USER'S ACTUAL MESSAGES" below.
2. DO NOT invent places, weather, objects, times of day, or sensory details the user did not mention.
3. DO NOT fabricate dialogue for other people.
4. DO NOT add metaphors, poetic flourishes, or literary ornamentation.
5. PRESERVE the user's vocabulary and speech rhythm EXACTLY.
   If the user said "진짜 힘들었어" keep it; NEVER polish it to "매우 고난스러웠다".
   If the user said "그 분", keep "그 분"; don't change to "그 사람".
6. If a detail is missing, LEAVE IT OUT — never fill gaps with imagination.
7. Emma's messages are CONTEXT ONLY. Do not quote, repeat, or paraphrase Emma.

════════════════════════════════════════════════
📝 WHAT "FAITHFUL PRESERVATION" LOOKS LIKE
════════════════════════════════════════════════
DO:
- Keep the user's own words and phrases verbatim whenever possible
- Preserve the natural flow and ordering of what they said
- Merge duplicated sentences (if user said the same thing twice, combine)
- Remove clear filler ("어", "음", "그러니까") and false starts
- Convert spoken grammar to readable written grammar ONLY where strictly necessary for clarity
- Keep emotional phrases, exclamations, and specific details exactly as spoken

DO NOT:
- Rewrite sentences to sound more "literary"
- Replace casual words with formal ones (or vice versa)
- Reorder events for better narrative flow
- Add transition sentences the user didn't say
- Insert reflections, meanings, or themes the user didn't explicitly state
- Compress multiple distinct thoughts into one sentence
- Skip details because they seem minor — the user chose to say them for a reason

════════════════════════════════════════════════
DETECTED STORY ELEMENTS (for tagging only, NOT for adding content)
════════════════════════════════════════════════
${elementsBlock}

════════════════════════════════════════════════
USER'S ACTUAL MESSAGES — your ONLY source of facts
════════════════════════════════════════════════
${userMessagesText}

════════════════════════════════════════════════
FULL CONVERSATION (Emma's turns are for flow context only)
════════════════════════════════════════════════
${conversationText}

${outputSection}

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
