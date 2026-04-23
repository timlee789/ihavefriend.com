/**
 * Daily Outreach System — Emma sends the first message every day.
 * Channel: SMS via Twilio
 * Types: check_in, proactive, care, quiz, memory_trigger, daily_question, photo_prompt
 */

/**
 * 2026-04-23 v2 schema migration:
 *  - No enum changes needed in this file.
 *  - emotion_sessions.emotional_arc is SELECTed but never compared.
 *  - outreach_log.message_type and channel are VARCHAR, not enum.
 *  - All memory_nodes.node_type queries use VARCHAR comparison.
 *  - This file uses ESM (import/export) — do NOT convert to CommonJS.
 */

import { neon } from '@neondatabase/serverless';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

// 🆕 Direct SQL INSERT for API usage logging (ESM file — no CommonJS require)
// Pricing mirrors lib/apiUsage.js.
const USAGE_PRICING = {
  'gemini-2.5-flash':   { input: 0.075 / 1e6, output: 0.30 / 1e6 },
  'gemini-2.5-pro':     { input: 1.25  / 1e6, output: 10.0 / 1e6 },
  'gemini-2.0-flash':   { input: 0.075 / 1e6, output: 0.30 / 1e6 },
  'text-embedding-004': { input: 0.025 / 1e6, output: 0 },
};

async function logOutreachUsage({ userId, model, operation, usageMetadata, latencyMs, success, errorCode = null }) {
  try {
    if (!userId) return;
    const sql = getDb();
    const input  = usageMetadata?.promptTokenCount     || 0;
    const output = usageMetadata?.candidatesTokenCount || 0;
    const total  = usageMetadata?.totalTokenCount      || (input + output);
    const price  = USAGE_PRICING[model] || { input: 0, output: 0 };
    const cost   = (input * price.input) + (output * price.output);
    await sql`
      INSERT INTO api_usage_logs
        (user_id, provider, model, operation,
         input_tokens, output_tokens, total_tokens, cost_usd,
         success, error_code, latency_ms)
      VALUES (${userId}, 'gemini', ${model}, ${operation},
              ${input}, ${output}, ${total}, ${cost.toFixed(8)},
              ${success}, ${errorCode}, ${latencyMs})
    `;
  } catch (err) {
    console.error('[dailyOutreach:usage] log failed (non-fatal):', err.message);
  }
}

// ── User context for message personalization ──────────────────
async function getUserContext(userId) {
  const sql = getDb();

  const emotions = await sql`
    SELECT avg_valence, dominant_emotion, emotional_arc
    FROM emotion_sessions
    WHERE user_id = ${userId}
    ORDER BY session_date DESC
    LIMIT 3
  `;

  const lastSession = await sql`
    SELECT started_at FROM chat_sessions
    WHERE user_id = ${userId}
    ORDER BY started_at DESC
    LIMIT 1
  `;

  const daysSinceLastChat = lastSession[0]
    ? Math.floor((Date.now() - new Date(lastSession[0].started_at)) / 86400000)
    : 999;

  const upcoming = await sql`
    SELECT label, data FROM memory_nodes
    WHERE user_id = ${userId} AND node_type = 'upcoming' AND is_active = true
      AND (data->>'date')::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    ORDER BY (data->>'date')::date
    LIMIT 2
  `;

  const positiveMemories = await sql`
    SELECT label, data, node_type FROM memory_nodes
    WHERE user_id = ${userId} AND is_active = true
      AND emotional_weight >= 3
      AND node_type IN ('life_story', 'people', 'hobbies')
    ORDER BY RANDOM()
    LIMIT 3
  `;

  const prefs = await sql`
    SELECT data FROM memory_nodes
    WHERE user_id = ${userId} AND node_type = 'preferences' AND is_active = true
    LIMIT 3
  `;

  const user = await sql`SELECT name FROM "User" WHERE id = ${userId}`;

  const avgValence = emotions[0]?.avg_valence
    ? parseFloat(emotions[0].avg_valence)
    : 0;

  return {
    name: user[0]?.name || 'Friend',
    recentEmotions: emotions,
    daysSinceLastChat,
    upcoming,
    positiveMemories,
    preferences: prefs.map(r => r.data),
    avgValence,
    dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
  };
}

// ── Pick message type based on context ───────────────────────
function selectMessageType(context) {
  if (context.daysSinceLastChat >= 3) return 'check_in';

  if (context.upcoming.length > 0) {
    const daysUntil = context.upcoming[0].data?.date
      ? Math.ceil((new Date(context.upcoming[0].data.date) - Date.now()) / 86400000)
      : 99;
    if (daysUntil <= 3) return 'proactive';
  }

  if (context.avgValence < -0.3) return 'care';

  const funTypes = ['quiz', 'memory_trigger', 'daily_question', 'photo_prompt'];
  return funTypes[new Date().getDate() % funTypes.length];
}

// ── Build message text ────────────────────────────────────────
async function buildMessage(userId, type, context) {
  const appLink = 'https://sayandkeep.com/chat?ref=sms';
  const apiKey = process.env.GEMINI_API_KEY;

  switch (type) {
    case 'check_in':
      return {
        type: 'check_in',
        text: `Hi ${context.name}, it's Emma. Haven't heard from you in a few days. Just checking in — how are you doing? ${appLink}`,
        deepLink: appLink,
      };

    case 'proactive': {
      const event = context.upcoming[0];
      return {
        type: 'proactive',
        text: `Hi ${context.name}! ${event.label} is coming up soon. Want to talk about it? ${appLink}`,
        deepLink: appLink,
      };
    }

    case 'care':
      return {
        type: 'care',
        text: `Hi ${context.name}, I've been thinking about you. I hope today is a good day. I'm here if you want to talk. ${appLink}`,
        deepLink: appLink,
      };

    case 'quiz': {
      const quiz = await generateQuiz(context, apiKey, { userId });
      return {
        type: 'quiz',
        text: `${context.name}, Emma here with a fun quiz! ${quiz.question} Reply with your answer! ${appLink}`,
        deepLink: appLink,
        quizAnswer: quiz.answer,
      };
    }

    case 'memory_trigger': {
      if (context.positiveMemories.length > 0) {
        const memory = context.positiveMemories[0];
        return {
          type: 'memory_trigger',
          text: `Hi ${context.name}! I was thinking about when you told me about ${memory.label}. What a great story. Want to tell me more? ${appLink}`,
          deepLink: appLink,
        };
      }
      return buildMessage(userId, 'daily_question', context);
    }

    case 'daily_question': {
      const question = await generateDailyQuestion(context, apiKey, { userId });
      return {
        type: 'daily_question',
        text: `Good morning ${context.name}! Emma's question of the day: ${question} ${appLink}`,
        deepLink: appLink,
      };
    }

    case 'photo_prompt':
      return {
        type: 'photo_prompt',
        text: `Hi ${context.name}! What's outside your window right now? I'd love to hear about your day. ${appLink}`,
        deepLink: appLink,
      };

    default:
      return {
        type: 'general',
        text: `Hi ${context.name}, it's Emma. How's your day going? ${appLink}`,
        deepLink: appLink,
      };
  }
}

// ── Gemini: trivia quiz ───────────────────────────────────────
async function generateQuiz(context, apiKey, opts = {}) {
  const { userId = null } = opts;
  const interests = context.preferences
    ?.flatMap(p => p.likes || [])
    ?.join(', ') || 'general knowledge, history, nature';

  const prompt = `Generate ONE fun trivia question suitable for a senior adult.
Topics they enjoy: ${interests}
Return JSON only: {"question": "...", "answer": "..."}
Keep the question short (under 100 characters). Make it fun and conversational.`;

  const t0 = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 200 },
        }),
      }
    );
    const data = await res.json();
    await logOutreachUsage({
      userId, model: 'gemini-2.5-flash', operation: 'outreach_quiz',
      usageMetadata: data.usageMetadata, latencyMs: Date.now() - t0, success: res.ok,
      errorCode: res.ok ? null : `http_${res.status}`,
    });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch (err) {
    await logOutreachUsage({
      userId, model: 'gemini-2.5-flash', operation: 'outreach_quiz',
      latencyMs: Date.now() - t0, success: false, errorCode: 'exception',
    });
    return { question: 'What year did humans first walk on the moon?', answer: '1969' };
  }
}

// ── Gemini: daily question ────────────────────────────────────
async function generateDailyQuestion(context, apiKey, opts = {}) {
  const { userId = null } = opts;
  const prompt = `Generate ONE warm, personal question to ask a ${
    context.avgValence < 0 ? 'person who has been feeling a bit down' : 'person having a normal week'
  }. Invite a story or memory, not just yes/no. Under 80 characters. No quotes.`;

  const t0 = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 100 },
        }),
      }
    );
    const data = await res.json();
    await logOutreachUsage({
      userId, model: 'gemini-2.5-flash', operation: 'outreach_question',
      usageMetadata: data.usageMetadata, latencyMs: Date.now() - t0, success: res.ok,
      errorCode: res.ok ? null : `http_${res.status}`,
    });
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      || "What's something that made you smile recently?";
  } catch {
    await logOutreachUsage({
      userId, model: 'gemini-2.5-flash', operation: 'outreach_question',
      latencyMs: Date.now() - t0, success: false, errorCode: 'exception',
    });
    return "What's something that made you smile recently?";
  }
}

// ── SMS via Twilio (no SDK — direct REST API) ─────────────────
export async function sendSMS(toPhone, messageText) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { sent: false, reason: 'twilio_not_configured' };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: toPhone, From: fromNumber, Body: messageText }),
      }
    );
    const data = await res.json();
    return data.sid ? { sent: true, sid: data.sid } : { sent: false, reason: data.message };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

// ── Daily outreach processor (run at 10 AM via cron) ─────────
export async function processDailyOutreach() {
  const sql = getDb();

  // All active users with phone numbers who have chatted at least once
  const users = await sql`
    SELECT u.id, u.name, u.phone
    FROM "User" u
    WHERE u.phone IS NOT NULL
      AND u.id IN (SELECT DISTINCT user_id FROM chat_sessions)
  `;

  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const user of users) {
    try {
      // Skip if already sent today
      const alreadySent = await sql`
        SELECT id FROM outreach_log
        WHERE user_id = ${user.id} AND sent_date = CURRENT_DATE
      `;
      if (alreadySent.length > 0) { results.skipped++; continue; }

      const context = await getUserContext(user.id);
      const type    = selectMessageType(context);
      const message = await buildMessage(user.id, type, context);
      const smsResult = await sendSMS(user.phone, message.text);

      await sql`
        INSERT INTO outreach_log (user_id, message_type, message_text, channel, sent, sent_date)
        VALUES (${user.id}, ${message.type}, ${message.text}, 'sms', ${smsResult.sent}, CURRENT_DATE)
      `;

      smsResult.sent ? results.sent++ : results.failed++;
    } catch (e) {
      console.error(`Outreach failed for user ${user.id}:`, e.message);
      results.failed++;
    }
  }

  return results;
}
