/**
 * Cloud-based Fragment generation via Gemini Flash.
 *
 * Replaces the old local-LLM queue flow (fragment_generation_queue + 5090 PC runner)
 * with a direct Gemini API call. Takes the user's actual transcript + detected elements,
 * returns a Fragment JSON (title, subtitle, content, tags…) with strict anti-hallucination rules.
 *
 * Designed to be called from chat/end/route.js after session end, as a fire-and-forget task.
 */

const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Generate a Story Fragment from a conversation via Gemini Flash.
 *
 * @param {Object} opts
 * @param {Object} opts.elements   - { when, where, who, what, emotion, why } from chat_sessions.fragment_elements
 * @param {Array}  opts.transcript - [{ role: 'user'|'assistant', content: string }]
 * @param {string} [opts.lang='ko']- ISO-639-1 language code ('ko', 'en', 'es')
 * @param {string} opts.apiKey     - GEMINI_API_KEY
 * @returns {Promise<Object|null>} - Fragment JSON or null on failure
 *   { title, subtitle, content, tags_era[], tags_people[], tags_place[], tags_theme[], tags_emotion[] }
 */
async function generateFragmentCloud({ elements, transcript, lang = 'ko', apiKey }) {
  if (!apiKey) {
    console.error('[generateFragmentCloud] Missing GEMINI_API_KEY');
    return null;
  }
  if (!Array.isArray(transcript) || transcript.length === 0) {
    console.error('[generateFragmentCloud] Empty transcript');
    return null;
  }

  // Extract user messages only — these are the factual basis for the fragment
  const userMessages = transcript
    .filter(m => m.role === 'user')
    .map(m => (m.content || m.text || '').trim())
    .filter(Boolean);

  if (userMessages.length === 0) {
    console.error('[generateFragmentCloud] No user messages in transcript');
    return null;
  }

  const normLang = (lang || 'ko').toLowerCase();
  const userLabel = normLang === 'ko' ? '사용자' : normLang === 'es' ? 'Usuario' : 'User';

  // Full conversation for flow context (Emma's turns clarify what user responded to, but are NOT facts)
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

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.3,        // low temp → factual fidelity, less embellishment
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[generateFragmentCloud] Gemini API error ${res.status}:`, errText.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch (parseErr) {
      console.error('[generateFragmentCloud] JSON parse failed:', parseErr.message, '| raw:', rawText.slice(0, 200));
      return null;
    }

    if (!parsed.title || !parsed.content) {
      console.error('[generateFragmentCloud] Response missing title/content:', JSON.stringify(parsed).slice(0, 300));
      return null;
    }

    return {
      title:        String(parsed.title).slice(0, 200),
      subtitle:     parsed.subtitle ? String(parsed.subtitle).slice(0, 300) : null,
      content:      String(parsed.content),
      tags_era:     Array.isArray(parsed.tags_era)     ? parsed.tags_era.map(String).slice(0, 10)     : [],
      tags_people:  Array.isArray(parsed.tags_people)  ? parsed.tags_people.map(String).slice(0, 10)  : [],
      tags_place:   Array.isArray(parsed.tags_place)   ? parsed.tags_place.map(String).slice(0, 10)   : [],
      tags_theme:   Array.isArray(parsed.tags_theme)   ? parsed.tags_theme.map(String).slice(0, 10)   : [],
      tags_emotion: Array.isArray(parsed.tags_emotion) ? parsed.tags_emotion.map(String).slice(0, 10) : [],
    };
  } catch (err) {
    console.error('[generateFragmentCloud] Generation failed:', err.message);
    return null;
  }
}

/**
 * Build the Gemini prompt with strict anti-hallucination guardrails.
 */
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
OUTPUT REQUIREMENTS
════════════════════════════════════════════════
- Length: 300–800 characters (target 400–600)
- First person, reflecting the user's voice
- Conversational, lightly polished for reading
- title: 10–30 chars, evocative but grounded in what the user said
- subtitle: 30–60 chars, one-line summary
- Tags: only include items that appear in user's messages. Use empty arrays if nothing fits.
  - tags_theme pick from: family, love, loss, work, faith, challenge, growth, friendship, identity, food, home, health, migration, education, dream, gratitude

Respond with ONLY valid JSON. No markdown fences, no explanation.

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
