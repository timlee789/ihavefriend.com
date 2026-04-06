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

  const { message = '', lang = 'en' } = await request.json().catch(() => ({}));

  const db = createDb();

  // 1. Create chat session row
  let sessionId;
  try {
    const res = await db.query(
      `INSERT INTO chat_sessions (user_id, started_at)
       VALUES ($1, NOW()) RETURNING id`,
      [user.id]
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
    const { buildEmmaPrompt, EMMA_BASE_PROMPT, EMMA_BASE_PROMPT_KO } = require('@/lib/recallEngine');
    const result = await buildEmmaPrompt(db, user.id, message, lang);
    systemPrompt = result.prompt;
    debugInfo = result.debugInfo;
  } catch (e) {
    console.error('[chat/setup] buildEmmaPrompt failed:', e.message);
    const { EMMA_BASE_PROMPT, EMMA_BASE_PROMPT_KO } = require('@/lib/recallEngine');
    systemPrompt = lang === 'ko' ? EMMA_BASE_PROMPT_KO : EMMA_BASE_PROMPT;
  }

  return Response.json({ sessionId, systemPrompt, debugInfo });
}
