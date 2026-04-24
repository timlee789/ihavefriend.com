/**
 * POST /api/reminder
 *
 * Called from EmmaChat when a reminder keyword is detected.
 * 1. If message+time are pre-extracted (retry after phone save): skip Gemini.
 * 2. Otherwise: use Gemini to extract reminder intent from user/AI messages.
 * 3. Look up user phone → if missing, return needs_phone: true.
 * 4. Send SMS via Twilio.
 *
 * Body: { userMessage, aiResponse } | { message, time }
 * Returns: { sent, needs_phone, message, time, reason? }
 */
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { sendSMS } from '@/lib/dailyOutreach';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

// 🆕 Fire-and-forget usage logger (Neon sql template; same pattern as dailyOutreach)
async function logReminderUsage(userId, usageMetadata, latencyMs, success = true, errorCode = null) {
  try {
    if (!userId) return;
    const sql = getDb();
    const input  = usageMetadata?.promptTokenCount     || 0;
    const output = usageMetadata?.candidatesTokenCount || 0;
    const total  = usageMetadata?.totalTokenCount      || (input + output);
    const cost   = (input * 0.075 / 1e6) + (output * 0.30 / 1e6);
    await sql`
      INSERT INTO api_usage_logs
        (user_id, provider, model, operation,
         input_tokens, output_tokens, total_tokens, cost_usd,
         success, error_code, latency_ms)
      VALUES (${userId}, 'gemini', 'gemini-2.5-flash', 'reminder_extract',
              ${input}, ${output}, ${total}, ${cost.toFixed(8)},
              ${success}, ${errorCode}, ${latencyMs})
    `;
  } catch (e) {
    console.warn('[reminder] usage log failed:', e.message);
  }
}

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { userMessage = '', aiResponse = '' } = body;
  let { message = '', time = '' } = body;

  const apiKey = process.env.GEMINI_API_KEY;

  // ── Step 1: Extract reminder details if not pre-provided ─────────────────────
  if (!message) {
    if (!apiKey) {
      return Response.json({ sent: false, reason: 'no_api_key' }, { status: 500 });
    }

    const tExtract = Date.now();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Extract a reminder request from this conversation.
User said: "${userMessage.substring(0, 500)}"
Emma replied: "${aiResponse.substring(0, 500)}"

If the user is clearly asking to be reminded of something, return:
{"is_reminder": true, "message": "brief description of what to remind (in user's language)", "time": "when (time/date, or empty string if not specified)"}

If NOT a reminder request, return:
{"is_reminder": false, "message": "", "time": ""}

Return ONLY valid JSON, no explanation.`,
              }],
            }],
            generation_config: { response_mime_type: 'application/json' },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        // 🆕 Log usage (fire-and-forget)
        await logReminderUsage(user.id, data.usageMetadata, Date.now() - tExtract, true);
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(raw.trim());
        if (!parsed.is_reminder) {
          return Response.json({ sent: false, reason: 'not_a_reminder' });
        }
        message = parsed.message || '';
        time    = parsed.time    || '';
      } else {
        await logReminderUsage(user.id, null, Date.now() - tExtract, false, `http_${res.status}`);
      }
    } catch (e) {
      console.error('[reminder] Gemini extraction failed:', e.message);
      await logReminderUsage(user.id, null, Date.now() - tExtract, false, 'exception');
      return Response.json({ sent: false, reason: 'extraction_failed' }, { status: 500 });
    }
  }

  if (!message) {
    return Response.json({ sent: false, reason: 'no_message_extracted' });
  }

  // ── Step 2: Look up user phone ───────────────────────────────────────────────
  const sql = getDb();
  const rows = await sql`SELECT phone, lang FROM "User" WHERE id = ${user.id} LIMIT 1`;
  const phone = rows[0]?.phone;
  const lang  = rows[0]?.lang || 'ko';

  if (!phone) {
    return Response.json({ sent: false, needs_phone: true, message, time });
  }

  // ── Step 3: Send SMS ─────────────────────────────────────────────────────────
  const smsBody = buildSmsText(message, time, lang);
  const result  = await sendSMS(phone, smsBody);

  return Response.json({
    sent:       result.sent,
    needs_phone: false,
    message,
    time,
    reason:     result.reason,
  });
}

function buildSmsText(message, time, lang) {
  const link = 'https://sayandkeep.com/chat';
  if (lang === 'ko') {
    return time
      ? `[엠마 알림] ${message} — ${time} 💙\n${link}`
      : `[엠마 알림] ${message} 💙\n${link}`;
  }
  if (lang === 'es') {
    return time
      ? `[Emma] Recordatorio: ${message} — ${time} 💙\n${link}`
      : `[Emma] Recordatorio: ${message} 💙\n${link}`;
  }
  return time
    ? `[Emma] Reminder: ${message} — ${time} 💙\n${link}`
    : `[Emma] Reminder: ${message} 💙\n${link}`;
}
