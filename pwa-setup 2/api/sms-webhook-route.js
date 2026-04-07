/**
 * API Route: POST /api/sms/webhook
 * 
 * Twilio calls this URL when a user replies to Emma's SMS.
 * This converts the SMS reply into a conversation entry.
 * 
 * Place this in: app/api/sms/webhook/route.js
 * 
 * Twilio webhook setup:
 * 1. Go to Twilio Console → Phone Numbers → Your number
 * 2. Under "Messaging", set webhook URL to:
 *    https://ihavefriend.com/api/sms/webhook
 * 3. Method: POST
 */

import { NextResponse } from 'next/server';
// import { db } from '@/lib/db';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const from = formData.get('From');
    const body = formData.get('Body');
    const sid = formData.get('MessageSid');

    if (!from || !body) {
      return new NextResponse('Missing data', { status: 400 });
    }

    // Find user by phone number
    const user = await db.query(
      'SELECT id, name FROM "User" WHERE phone = $1',
      [from]
    );

    const userId = user.rows[0]?.id || null;

    // Log the inbound SMS
    await db.query(`
      INSERT INTO sms_inbound (from_phone, user_id, body, twilio_sid)
      VALUES ($1, $2, $3, $4)
    `, [from, userId, body, sid]);

    // Mark today's outreach as replied
    if (userId) {
      await db.query(`
        UPDATE outreach_log 
        SET user_replied = true, replied_at = NOW()
        WHERE user_id = $1 AND sent_date = CURRENT_DATE
      `, [userId]);
    }

    // Generate Emma's reply via Gemini
    // (Use the recall engine to include memory context)
    let replyText = "Thanks for your message! Open the app to continue our conversation.";

    if (userId) {
      try {
        const { buildEmmaPrompt } = require('@/lib/recallEngine');
        const { prompt } = await buildEmmaPrompt(db, userId, body);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: prompt }] },
              contents: [{ parts: [{ text: body }] }],
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 200,  // Keep SMS replies short
              },
            }),
          }
        );

        const data = await response.json();
        const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (aiReply) {
          // Truncate to SMS length (160 chars) + add app link
          const maxLen = 140;
          replyText = aiReply.length > maxLen 
            ? aiReply.substring(0, maxLen) + '...'
            : aiReply;
          replyText += '\nhttps://ihavefriend.com/chat';
        }
      } catch (err) {
        console.error('AI reply generation failed:', err);
      }
    }

    // Respond with TwiML (Twilio's response format)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(replyText)}</Message>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('SMS webhook error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
