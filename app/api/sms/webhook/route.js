/**
 * POST /api/sms/webhook
 * Twilio calls this when a user replies to Emma's SMS.
 *
 * Twilio setup:
 * Console → Phone Numbers → Your number → Messaging webhook:
 *   https://sayandkeep.com/api/sms/webhook  (POST)
 */

import { neon } from '@neondatabase/serverless';
import { buildEmmaPrompt } from '@/lib/recallEngine';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const from = formData.get('From');
    const body = formData.get('Body');
    const sid  = formData.get('MessageSid');

    if (!from || !body) {
      return new Response('Missing data', { status: 400 });
    }

    const sql = getDb();

    // Find user by phone number
    const users = await sql`SELECT id, name FROM "User" WHERE phone = ${from} LIMIT 1`;
    const userId = users[0]?.id || null;

    // Log inbound SMS
    await sql`
      INSERT INTO sms_inbound (from_phone, user_id, body, twilio_sid)
      VALUES (${from}, ${userId}, ${body}, ${sid})
    `;

    // Mark today's outreach as replied
    if (userId) {
      await sql`
        UPDATE outreach_log
        SET user_replied = true, replied_at = NOW()
        WHERE user_id = ${userId} AND sent_date = CURRENT_DATE
      `;
    }

    // Generate Emma's reply via Gemini
    let replyText = "Thanks for your message! Open the app to continue our conversation: https://sayandkeep.com/chat";

    if (userId) {
      try {
        const { prompt } = await buildEmmaPrompt(sql, userId, body);
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: prompt }] },
              contents: [{ parts: [{ text: body }] }],
              generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
            }),
          }
        );
        const data = await res.json();
        const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (aiReply) {
          const maxLen = 140;
          replyText = (aiReply.length > maxLen ? aiReply.substring(0, maxLen) + '...' : aiReply)
            + '\nhttps://sayandkeep.com/chat';
        }
      } catch (e) {
        console.error('AI reply failed:', e.message);
      }
    }

    // Respond with TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(replyText)}</Message></Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (e) {
    console.error('SMS webhook error:', e);
    return new Response('Error', { status: 500 });
  }
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
