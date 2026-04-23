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
import { conversationModeToDb } from '@/lib/enumMappers';
import { after } from 'next/server';

// 2026-04-23 v2 schema migration:
//  - conversation_mode is now ConversationMode enum (AUTO/COMPANION/STORY)
//  - safeMode stays lowercase in JS, converted to enum via mapper at INSERT

// Allow background abandoned-session recovery enough headroom
export const maxDuration = 60;

export async function POST(request) {
  const tSetup0 = Date.now();
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { message = '', lang = 'en', conversationMode = 'auto' } = await request.json().catch(() => ({}));
  const safeMode = ['companion', 'story', 'auto'].includes(conversationMode) ? conversationMode : 'auto';

  const db = createDb();

  // 0. Close any abandoned sessions for this user (no ended_at, older than 5 min).
  //    MOVED TO after() so it NEVER blocks prompt assembly / session creation —
  //    this used to add several seconds to the very first Gemini response while
  //    we re-ran processSessionEnd on old transcripts.
  after(async () => {
    const tAb = Date.now();
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
          try {
            const { processSessionEnd } = require('@/lib/recallEngine');
            await processSessionEnd(db, user.id, sess.id, savedTranscript, apiKey);
            console.log(`[chat/setup:bg] Recovered abandoned session ${sess.id}`);
          } catch (e) {
            console.warn(`[chat/setup:bg] Could not recover ${sess.id}:`, e.message);
            await db.query(`UPDATE chat_sessions SET ended_at = NOW() WHERE id = $1`, [sess.id]);
          }
        } else {
          await db.query(`UPDATE chat_sessions SET ended_at = NOW() WHERE id = $1`, [sess.id]);
        }
      }
      console.log(`[chat/setup:bg] Abandoned cleanup done in ${Date.now() - tAb}ms — ${abandoned.rows.length} sessions`);
    } catch (e) {
      console.warn('[chat/setup:bg] Abandoned cleanup failed:', e.message);
    }
  });

  // 1. Create chat session row
  let sessionId;
  console.time('[chat/setup] insert-session');
  try {
    const res = await db.query(
      `INSERT INTO chat_sessions (user_id, started_at, conversation_mode, created_at, updated_at)
       VALUES ($1, NOW(), $2, NOW(), NOW()) RETURNING id`,
      [user.id, conversationModeToDb(safeMode)]
    );
    sessionId = res.rows[0]?.id;
  } catch (e) {
    console.error('[chat/setup] Failed to create session:', e.message);
    return Response.json({ error: 'DB error creating session' }, { status: 500 });
  }
  console.timeEnd('[chat/setup] insert-session');

  // 2. Build memory-enriched system prompt (language-aware)
  let systemPrompt = '';
  let debugInfo = null;
  console.time('[chat/setup] buildEmmaPrompt');
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
  console.timeEnd('[chat/setup] buildEmmaPrompt');
  console.log(`[chat/setup] systemPromptLen=${systemPrompt.length} (warn if >10000)`);
  if (systemPrompt.length > 10_000) {
    console.warn(`[chat/setup] ⚠️ system prompt is ${systemPrompt.length} chars — Gemini Live latency will suffer. Consider tightening recallEngine memory cap.`);
  }

  // Return the server's Gemini API key to authenticated clients (WebSocket use only).
  // The key is never stored in localStorage — only held in React state for the session.
  const geminiKey = process.env.GEMINI_API_KEY || null;

  console.log(`[chat/setup] total=${Date.now() - tSetup0}ms session=${sessionId} mode=${safeMode} lang=${lang}`);
  return Response.json({ sessionId, systemPrompt, debugInfo, geminiKey, conversationMode: safeMode });
}
