/**
 * POST /api/chat/end
 *
 * Called when a conversation session ends.
 * Runs the full Memory Engine pipeline:
 *   1. Extract memories from transcript → save to memory_nodes
 *   2. Summarize session emotions → save to emotion_sessions
 *   3. Check alert conditions
 *   4. Mark chat_sessions row as complete
 *
 * Body: { sessionId, transcript: [{role, text}], apiKey }
 * Returns: { ok: true, memoriesExtracted: number }
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { sessionId, transcript = [], apiKey } = await request.json().catch(() => ({}));

  console.log(`[chat/end] user=${user.id} session=${sessionId} transcriptLen=${transcript.length} hasApiKey=${!!apiKey}`);

  if (!sessionId) {
    return Response.json({ ok: true, memoriesExtracted: 0 });
  }
  if (!apiKey) {
    console.warn('[chat/end] No apiKey provided — cannot extract memories');
    return Response.json({ ok: true, memoriesExtracted: 0 });
  }
  if (transcript.length < 2) {
    console.warn('[chat/end] Transcript too short — skipping extraction');
    return Response.json({ ok: true, memoriesExtracted: 0 });
  }

  const db = createDb();

  // Convert transcript format: [{role, text}] → [{role, content}]
  const history = transcript.map(t => ({
    role: t.role === 'user' ? 'user' : 'assistant',
    content: t.text || '',
  }));

  let result = { memoriesExtracted: 0 };
  try {
    const { processSessionEnd } = require('@/lib/recallEngine');
    result = await processSessionEnd(db, user.id, sessionId, history, apiKey);
    console.log(`[chat/end] ✅ user=${user.id} session=${sessionId} memories=${result.memoriesExtracted}`);
  } catch (e) {
    console.error('[chat/end] processSessionEnd failed:', e.message);
    // Still mark session ended even if memory extraction failed
    try {
      await db.query(
        `UPDATE chat_sessions SET ended_at = NOW() WHERE id = $1`,
        [sessionId]
      );
    } catch {}
  }

  return Response.json({ ok: true, memoriesExtracted: result.memoriesExtracted || 0 });
}
