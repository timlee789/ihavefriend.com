/**
 * POST /api/chat/setup
 *
 * Called once when a chat session starts.
 * 1. Creates a chat_sessions row → returns sessionId
 * 2. Runs recallEngine.buildEmmaPrompt → returns memory-enriched system prompt
 *
 * Body: { message?: string }   (optional opening message for context matching)
 * Returns: { sessionId, systemPrompt, debugInfo }
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { message = '', lang = 'en', conversationMode = 'auto' } = await request.json().catch(() => ({}));
  const safeMode = ['companion', 'story', 'auto'].includes(conversationMode) ? conversationMode : 'auto';

  const db = createDb();

  // 0. Close any abandoned sessions for this user (no ended_at, older than 5 min)
  //    Process their saved transcript_data so memories aren't lost
  try {
    const abandoned = await db.query(`
      SELECT id, transcript_data
      FROM chat_sessions
      WHERE user_id = $1
        AND ended_at IS NULL
        AND memories_extracted = false
        AND started_at < NOW() - INTERVAL '5 minutes'
      LIMIT 5
    `, [user.id]);

    const apiKey = process.env.GEMINI_API_KEY;
    for (const sess of abandoned.rows) {
      const savedTranscript = sess.transcript_data || [];
      if (apiKey && savedTranscript.length >= 2) {
        // Extract memories from the saved transcript in the background
        try {
          const { processSessionEnd } = require('@/lib/recallEngine');
          await processSessionEnd(db, user.id, sess.id, savedTranscript, apiKey);
          console.log(`[chat/setup] Recovered abandoned session ${sess.id} — extracted memories`);
        } catch (e) {
          console.warn(`[chat/setup] Could not recover session ${sess.id}:`, e.message);
          // At least mark it ended
          await db.query(`UPDATE chat_sessions SET ended_at = NOW() WHERE id = $1`, [sess.id]);
        }
      } else {
        await db.query(`UPDATE chat_sessions SET ended_at = NOW() WHERE id = $1`, [sess.id]);
      }
    }
  } catch (e) {
    console.warn('[chat/setup] Abandoned session cleanup failed:', e.message);
  }

  // 1. Create chat session row
  let sessionId;
  try {
    const res = await db.query(
      `INSERT INTO chat_sessions (user_id, started_at, conversation_mode)
       VALUES ($1, NOW(), $2) RETURNING id`,
      [user.id, safeMode]
    );
    sessionId = res.rows[0]?.id;
  } catch (e) {
    console.error('[chat/setup] Failed to create session:', e.message);
    return Response.json({ error: 'DB error creating session' }, { status: 500 });
  }

  // 2. Build memory-enriched system prompt (language-aware)
  let systemPrompt = '';
  let debugInfo = null;
  try {
    const { buildEmmaPrompt } = require('@/lib/recallEngine');
    const result = await buildEmmaPrompt(db, user.id, user, message, lang, sessionId, safeMode);
    systemPrompt = result.prompt;
    debugInfo = result.debugInfo;
  } catch (e) {
    console.error('[chat/setup] buildEmmaPrompt failed:', e.message);
    const { EMMA_BASE_PROMPT, EMMA_BASE_PROMPT_KO, EMMA_BASE_PROMPT_ES } = require('@/lib/recallEngine');
    systemPrompt = lang === 'ko' ? EMMA_BASE_PROMPT_KO
                 : lang === 'es' ? EMMA_BASE_PROMPT_ES
                 : EMMA_BASE_PROMPT;
  }

  // Return the server's Gemini API key to authenticated clients (WebSocket use only).
  // The key is never stored in localStorage — only held in React state for the session.
  const geminiKey = process.env.GEMINI_API_KEY || null;

  return Response.json({ sessionId, systemPrompt, debugInfo, geminiKey, conversationMode: safeMode });
}
