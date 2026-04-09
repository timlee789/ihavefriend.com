/**
 * POST /api/chat/turn
 *
 * Called after each completed conversation turn.
 * Analyzes emotion in the user's message and saves it.
 * Fire-and-forget from the client — errors are logged but don't block UX.
 *
 * Body: { sessionId, turnNumber, userMessage }
 * Returns: { ok: true }
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  // API key comes from server env — never from client
  const apiKey = process.env.GEMINI_API_KEY;

  const { sessionId, turnNumber, userMessage, userText, aiText } = await request.json().catch(() => ({}));
  if (!sessionId || !userMessage) {
    return Response.json({ ok: true }); // nothing to do
  }

  const db = createDb();

  // Analyze emotion via Gemini generateContent (non-blocking best-effort)
  let emotion = null;
  if (apiKey && userMessage) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `Analyze the emotion in this message from a user talking to an AI friend.
Return ONLY JSON with no explanation:
{"detected_emotions": ["list", "of", "emotions"], "valence": 0.0, "arousal": 0.5, "dominant": "primary_emotion", "trigger": "what_caused_it_or_null", "concern_level": 0, "topic_sensitivity": null}

valence: -1.0 (very negative) to 1.0 (very positive)
arousal: 0.0 (calm) to 1.0 (excited)
concern_level: 0 (none), 1 (mild), 2 (serious)

User message: "${userMessage.substring(0, 300)}"` }]
            }],
            generation_config: { response_mime_type: 'application/json' },
          }),
        }
      );
      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(raw.trim());
        emotion = {
          detected_emotions: parsed.detected_emotions || [],
          valence: Math.max(-1, Math.min(1, parseFloat(parsed.valence) || 0)),
          arousal: Math.max(0, Math.min(1, parseFloat(parsed.arousal) || 0.5)),
          dominant: parsed.dominant || 'neutral',
          trigger: parsed.trigger || null,
          concern_level: Math.max(0, Math.min(2, parseInt(parsed.concern_level) || 0)),
          topic_sensitivity: parsed.topic_sensitivity || null,
        };
      }
    } catch (e) {
      console.error('[chat/turn] Emotion analysis failed:', e.message);
    }
  }

  // Save emotion turn
  if (emotion) {
    try {
      const { saveEmotionTurn } = require('@/lib/emotionTracker');
      await saveEmotionTurn(db, user.id, sessionId, turnNumber, userMessage, emotion);
    } catch (e) {
      console.error('[chat/turn] saveEmotionTurn failed:', e.message);
    }
  }

  // Accumulate transcript in DB so page-close doesn't lose conversation
  if (userText || aiText) {
    try {
      const newTurns = [];
      if (userText) newTurns.push({ role: 'user',      content: userText });
      if (aiText)   newTurns.push({ role: 'assistant', content: aiText  });
      await db.query(`
        UPDATE chat_sessions
        SET transcript_data = COALESCE(transcript_data, '[]'::jsonb) || $1::jsonb
        WHERE id = $2
      `, [JSON.stringify(newTurns), sessionId]);
    } catch (e) {
      console.error('[chat/turn] transcript save failed:', e.message);
    }
  }

  return Response.json({ ok: true, emotion });
}
