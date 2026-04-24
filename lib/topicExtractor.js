/**
 * Topic Anchor Extractor
 *
 * 2026-04-24: Extracts the declared topic from user's first message in a
 * story-mode session. Used to constrain Emma's questions and Fragment's
 * title/subtitle to the user's stated intent.
 *
 * Philosophy: User sovereignty. The user declares the topic; Emma respects it.
 */

const { logApiUsage } = require('./apiUsage');

const EXTRACTION_MODEL = 'gemini-2.5-flash';

/**
 * Extract a short topic label from the user's first message.
 *
 * @param {string} firstMessage - The user's first message in the session.
 * @param {string} lang - 'ko' | 'en' | 'es'
 * @param {string} apiKey - Gemini API key
 * @param {Object} opts - { db, userId, sessionId } for usage logging
 * @returns {Promise<string|null>} - Short topic string or null if extraction fails
 */
async function extractTopicAnchor(firstMessage, lang, apiKey, opts = {}) {
  const { db = null, userId = null, sessionId = null } = opts;
  const tag = '[topicExtractor]';

  if (!firstMessage || firstMessage.trim().length < 5) {
    return null; // Too short to extract a meaningful topic
  }
  if (!apiKey) {
    console.warn(`${tag} No API key — skipping topic extraction`);
    return null;
  }

  const langInstructions = {
    ko: '한국어로 답하세요. 주제를 5-15자로 간결하게.',
    en: 'Respond in English. 3-8 words for the topic.',
    es: 'Responde en español. 3-8 palabras para el tema.',
  }[lang] || '한국어로 답하세요. 주제를 5-15자로 간결하게.';

  const prompt = `You are analyzing the first message of a storytelling session.
Extract the MAIN TOPIC that the user declared they want to talk about.

CRITICAL RULES:
- Return ONLY the topic, no explanation, no quotes, no punctuation at the end.
- If the user said "오늘은 가게에 대해 이야기하고 싶어요" → "운영하는 가게"
- If the user said "어머니 이야기" → "어머니"
- If the user said "I want to talk about my first job" → "my first job"
- Keep it short and specific.
- ${langInstructions}
- If the message has no clear topic, return exactly: NO_TOPIC

USER'S FIRST MESSAGE:
"${firstMessage.trim()}"

Topic:`;

  const t0 = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EXTRACTION_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,    // Low temp for consistency
            maxOutputTokens: 64, // Very short output
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    const data = await res.json();

    // Log usage
    if (db && userId) {
      await logApiUsage(db, {
        userId, sessionId,
        provider: 'gemini',
        model: EXTRACTION_MODEL,
        operation: 'topic_extract',
        usageMetadata: data.usageMetadata,
        latencyMs: Date.now() - t0,
        success: res.ok,
        errorCode: res.ok ? null : `http_${res.status}`,
      });
    }

    if (!res.ok) {
      console.warn(`${tag} Gemini API ${res.status} — skipping anchor`);
      return null;
    }

    const rawTopic = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!rawTopic || rawTopic.toUpperCase() === 'NO_TOPIC') {
      console.log(`${tag} No topic extracted — leaving anchor null`);
      return null;
    }

    // Clean: strip quotes, trailing punctuation, newlines
    const cleaned = rawTopic
      .replace(/^["'「『]+|["'」』]+$/g, '')
      .replace(/[.!?。，,]+$/g, '')
      .split('\n')[0]
      .trim()
      .slice(0, 200);

    if (cleaned.length < 2) return null;

    console.log(`${tag} ✅ extracted topic: "${cleaned}"`);
    return cleaned;

  } catch (err) {
    console.error(`${tag} extraction failed (non-fatal):`, err.message);
    if (db && userId) {
      await logApiUsage(db, {
        userId, sessionId,
        provider: 'gemini',
        model: EXTRACTION_MODEL,
        operation: 'topic_extract',
        latencyMs: Date.now() - t0,
        success: false,
        errorCode: err.message?.slice(0, 50),
      });
    }
    return null;
  }
}

module.exports = { extractTopicAnchor, EXTRACTION_MODEL };
