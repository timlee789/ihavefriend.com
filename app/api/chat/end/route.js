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
 * Body: { sessionId, transcript: [{role, text}] }
 * Returns: { ok: true, memoriesExtracted: number }
 */
import { requireAuth, verifyToken } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { prisma } from '@/lib/prisma';

export async function POST(request) {
  // API key comes from server env — never from client
  const apiKey = process.env.GEMINI_API_KEY;

  // Read body first (sendBeacon can't send Authorization header)
  let body = {};
  try {
    const text = await request.text();
    body = JSON.parse(text);
  } catch {}

  const { sessionId, transcript: clientTranscript = [], _token, conversationMode = 'auto' } = body;

  // Auth: prefer Authorization header, fall back to _token in body (for sendBeacon)
  let user = null;
  const authHeader = request.headers.get('authorization') || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenToUse = headerToken || _token;

  if (tokenToUse) {
    try {
      const { verifyToken } = await import('@/lib/auth');
      const decoded = verifyToken(tokenToUse);
      if (decoded?.userId) {
        user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (user && !user.isActive) user = null;
      }
    } catch {}
  }

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!sessionId) {
    return Response.json({ ok: true, memoriesExtracted: 0 });
  }

  const db = createDb();

  // Prefer client-sent transcript; fall back to server-accumulated transcript_data
  let transcript = clientTranscript;
  if (transcript.length < 2) {
    try {
      const row = await db.query(
        `SELECT transcript_data FROM chat_sessions WHERE id = $1 AND user_id = $2`,
        [sessionId, user.id]
      );
      const saved = row.rows[0]?.transcript_data || [];
      if (saved.length >= 2) {
        // transcript_data is [{role, content}] — convert to [{role, text}] for compatibility
        transcript = saved.map(m => ({ role: m.role, text: m.content || '' }));
        console.log(`[chat/end] Using server-saved transcript (${transcript.length} msgs) for session ${sessionId}`);
      }
    } catch (e) {
      console.warn('[chat/end] Could not load server transcript:', e.message);
    }
  }

  // Resolve conversation_mode: prefer body value, fall back to DB
  let sessionMode = conversationMode;
  if (!['companion', 'story', 'auto'].includes(sessionMode)) sessionMode = 'auto';
  try {
    const modeRow = await db.query(
      `SELECT conversation_mode FROM chat_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, user.id]
    );
    const dbMode = modeRow.rows[0]?.conversation_mode;
    if (dbMode && dbMode !== 'auto') sessionMode = dbMode; // DB wins if set
  } catch {}

  console.log(`[chat/end] user=${user.id} session=${sessionId} transcriptLen=${transcript.length} hasApiKey=${!!apiKey} mode=${sessionMode}`);

  if (!apiKey) {
    console.warn('[chat/end] GEMINI_API_KEY not set — cannot extract memories');
    await db.query(`UPDATE chat_sessions SET ended_at = NOW() WHERE id = $1`, [sessionId]);
    return Response.json({ ok: true, memoriesExtracted: 0 });
  }
  if (transcript.length < 2) {
    console.warn('[chat/end] Transcript too short — skipping extraction');
    await db.query(`UPDATE chat_sessions SET ended_at = NOW() WHERE id = $1`, [sessionId]);
    return Response.json({ ok: true, memoriesExtracted: 0 });
  }

  // Convert transcript format: [{role, text}] → [{role, content}]
  const history = transcript.map(t => ({
    role: t.role === 'user' ? 'user' : 'assistant',
    content: t.text || t.content || '',
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

  // ── Fragment detection via REST (Gemini Live uses AUDIO-only, no text parts) ──
  // Analyze the full transcript with Gemini to detect story-worthy moments,
  // then queue fragment generation if found.
  let fragmentJobId = null;
  if (apiKey && history.length >= 2) {
    try {
      const conversationText = history
        .map(m => `${m.role === 'user' ? '사용자' : 'Emma'}: ${m.content}`)
        .join('\n');

      const analysisPrompt = `Analyze this conversation between a user and Emma (AI friend) for story-worthy moments.

A story-worthy moment has specific WHEN, WHERE, WHO, WHAT, EMOTION, or WHY elements.

Conversation:
${conversationText.substring(0, 3000)}

Return ONLY valid JSON (no explanation):
{
  "fragment": {
    "detected": false,
    "elements": {
      "when": null,
      "where": null,
      "who": [],
      "what": null,
      "emotion": null,
      "why": null
    },
    "completeness": 0,
    "deepening_question_asked": false,
    "deepening_topic": null
  }
}

Rules:
- detected=true only for genuine personal stories/memories (not small talk)
- completeness = count of non-null/non-empty elements (0-6)
- "오늘 날씨 좋다" → detected: false
- "20년 전 아버지와 함께 가게를 열었던 날" → detected: true, completeness: 3+`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: analysisPrompt }] }],
            generationConfig: { response_mime_type: 'application/json', temperature: 0.1 },
          }),
        }
      );

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(raw.trim());
        const fragment = parsed.fragment;

        console.log(`[chat/end] Fragment analysis → detected=${fragment?.detected} completeness=${fragment?.completeness} mode=${sessionMode}`);

        // Threshold: story mode is more permissive (completeness >= 2),
        // companion and auto modes require stronger signal (completeness >= 3)
        const completenessThreshold = sessionMode === 'story' ? 2 : 3;

        // story mode: queue immediately if detected regardless of completeness
        // companion mode: only queue if Gemini's analysis is confident (detected + threshold met)
        const shouldQueue = fragment?.detected &&
          (sessionMode === 'story' || (fragment?.completeness ?? 0) >= completenessThreshold);

        if (shouldQueue) {
          await db.query(
            `UPDATE chat_sessions
             SET fragment_candidate = true,
                 fragment_elements = $1
             WHERE id = $2`,
            [JSON.stringify(fragment), sessionId]
          );

          // story mode → higher priority (2), companion/auto → normal priority (5)
          const priority         = sessionMode === 'story' ? 2 : 5;
          const completenessMin  = sessionMode === 'story' ? 2 : 3;
          const { queueFragmentGeneration } = require('@/lib/storyPromptBuilder');
          fragmentJobId = await queueFragmentGeneration(db, user.id, sessionId, priority, completenessMin);
          if (fragmentJobId) {
            console.log(`[chat/end] ✅ Fragment job queued (priority=${priority}): ${fragmentJobId}`);
          }
        } else if (fragment?.detected) {
          console.log(`[chat/end] Fragment detected but below threshold (completeness=${fragment?.completeness ?? 0} < ${completenessThreshold}) — skipping queue`);
        } else {
          console.log(`[chat/end] No story-worthy content detected (completeness=${fragment?.completeness ?? 0})`);
        }
      }
    } catch (e) {
      console.error('[chat/end] Fragment detection failed:', e.message);
    }
  }

  return Response.json({ ok: true, memoriesExtracted: result.memoriesExtracted || 0, fragmentJobQueued: !!fragmentJobId });
}
