/**
 * POST /api/chat/turn
 *
 * Called after each completed conversation turn.
 * Responds IMMEDIATELY (< 5ms) — all work runs in the background.
 * This is fire-and-forget from the client; latency here never blocks Emma.
 *
 * Body: { sessionId, turnNumber, userMessage, userText?, aiText?, rawAiText? }
 * Returns: { ok: true }  ← returned before any background work starts
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const t0 = Date.now();
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const apiKey = process.env.GEMINI_API_KEY;

  const { sessionId, turnNumber, userMessage, userText, aiText, rawAiText } =
    await request.json().catch(() => ({}));

  if (!sessionId || !userMessage) {
    return Response.json({ ok: true });
  }

  // 🆕 Task 66 — Quota gate at every turn so a session that crosses
  //   the limit mid-conversation doesn't keep burning Gemini calls in
  //   the background IIFE. Failures fail OPEN (see quotaCheck header).
  {
    const { checkQuota } = require('@/lib/quotaCheck');
    const dbCheck = createDb();
    const quota = await checkQuota(dbCheck, user.id);
    if (quota.blocked) return Response.json(quota.response, { status: 402 });
  }

  // 🔥 Task 79 diagnostic — print every length the server sees on
  //   this turn. If the EmmaChat console shows a long userMsg but the
  //   server prints a short userMessage, the request body is being
  //   trimmed in flight (gzip / network / proxy). If both ends agree,
  //   the trim is happening downstream in fragment generation.
  console.log(
    `[Turn] t=${t0} turn=${turnNumber} session=${sessionId} user=${user.id} ` +
    `msgLen=${userMessage?.length ?? 0} ` +
    `userTextLen=${userText?.length ?? 0} aiTextLen=${aiText?.length ?? 0} ` +
    `rawAiTextLen=${rawAiText?.length ?? 0}`
  );

  // ─── Return immediately — ALL heavy work is fire-and-forget ───────────────
  // Background IIFE: emotion analysis + fragment detection + transcript save.
  // On Vercel Node.js the async work continues running after we respond.
  ;(async () => {
    const db = createDb();
    const tWork = Date.now();
    console.time(`[Turn] bg-total turn=${turnNumber}`);

    // ── 1. Emotion analysis (Gemini generateContent, capped at 10s) ──────────
    let emotion = null;
    if (apiKey && userMessage) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s hard timeout

        const tGemini = Date.now();
        console.time(`[Turn] emotion-analysis turn=${turnNumber}`);
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            signal: controller.signal,
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
        clearTimeout(timeoutId);

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          // 🆕 Log emotion analysis API usage (fire-and-forget)
          try {
            const { logApiUsage } = require('@/lib/apiUsage');
            await logApiUsage(db, {
              userId: user.id, sessionId,
              provider: 'gemini',
              model: 'gemini-2.5-flash',
              operation: 'emotion_analysis',
              usageMetadata: data.usageMetadata,
              latencyMs: Date.now() - tGemini,
              success: true,
            });
          } catch {}
          const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = JSON.parse(raw.trim());
          emotion = {
            detected_emotions: parsed.detected_emotions || [],
            valence:           Math.max(-1, Math.min(1, parseFloat(parsed.valence)  || 0)),
            arousal:           Math.max(0,  Math.min(1, parseFloat(parsed.arousal)  || 0.5)),
            dominant:          parsed.dominant || 'neutral',
            trigger:           parsed.trigger  || null,
            concern_level:     Math.max(0, Math.min(2, parseInt(parsed.concern_level) || 0)),
            topic_sensitivity: parsed.topic_sensitivity || null,
          };
        }
        console.timeEnd(`[Turn] emotion-analysis turn=${turnNumber}`);
        console.log(`[Turn] emotion analysis done in ${Date.now() - tGemini}ms`);
      } catch (e) {
        if (e.name === 'AbortError') {
          console.warn('[Turn] emotion analysis timed out (10s) — skipping');
        } else {
          console.error('[Turn] emotion analysis failed:', e.message);
        }
        // 🆕 Log failure (fire-and-forget)
        try {
          const { logApiUsage } = require('@/lib/apiUsage');
          await logApiUsage(db, {
            userId: user.id, sessionId,
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            operation: 'emotion_analysis',
            latencyMs: Date.now() - tGemini,
            success: false,
            errorCode: e.name === 'AbortError' ? 'timeout' : 'exception',
          });
        } catch {}
      }
    }

    // ── 2. Save emotion turn ──────────────────────────────────────────────────
    if (emotion) {
      console.time(`[Turn] save-emotion turn=${turnNumber}`);
      try {
        const { saveEmotionTurn } = require('@/lib/emotionTracker');
        await saveEmotionTurn(db, user.id, sessionId, turnNumber, userMessage, emotion);
      } catch (e) {
        console.error('[Turn] saveEmotionTurn failed:', e.message);
      }
      console.timeEnd(`[Turn] save-emotion turn=${turnNumber}`);
    }

    // ── 3. Per-turn fragment detection (text parts only; AUDIO mode = empty) ──
    const analysisSource = rawAiText || '';
    if (analysisSource.includes('<emma_analysis>')) {
      console.time(`[Turn] fragment-detect turn=${turnNumber}`);
      try {
        const { parseEmmaAnalysis, saveFragmentDetection } = require('@/lib/storyPromptBuilder');
        const { fragment } = parseEmmaAnalysis(analysisSource);
        console.log(`[Turn] fragment.detected=${fragment?.detected} completeness=${fragment?.completeness ?? 0}`);
        await saveFragmentDetection(db, sessionId, fragment);
      } catch (e) {
        console.error('[Turn] fragment detection failed:', e.message);
      }
      console.timeEnd(`[Turn] fragment-detect turn=${turnNumber}`);
    }

    // ── 3.5 Topic Anchor extraction (first turn only, story mode only) ─────
    // 🆕 2026-04-24: Fire-and-forget. Story mode + turn 1 + no existing anchor.
    try {
      if (turnNumber === 1) {
        const sessionRow = await db.query(
          `SELECT conversation_mode, topic_anchor FROM chat_sessions WHERE id = $1`,
          [sessionId]
        );
        const sess = sessionRow.rows[0];
        if (sess?.conversation_mode === 'STORY' && !sess.topic_anchor) {
          const { extractTopicAnchor } = require('@/lib/topicExtractor');
          const lang = (user.lang || 'ko').toLowerCase();
          const anchor = await extractTopicAnchor(userMessage, lang, apiKey, {
            db, userId: user.id, sessionId,
          });
          if (anchor) {
            await db.query(
              `UPDATE chat_sessions SET topic_anchor = $1 WHERE id = $2`,
              [anchor, sessionId]
            );
            console.log(`[Turn] topic_anchor saved: "${anchor}"`);
          }
        }
      }
    } catch (e) {
      console.warn('[Turn] topic anchor extraction failed (non-fatal):', e.message);
    }

    // ── 4. Accumulate transcript in DB (crash-safe) ────────────────────────
    if (userText || aiText) {
      console.time(`[Turn] transcript-save turn=${turnNumber}`);
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
        console.error('[Turn] transcript save failed:', e.message);
      }
      console.timeEnd(`[Turn] transcript-save turn=${turnNumber}`);
    }

    // ── 5. 🆕 Stage 3 (Task 90) — Emma decision pipeline ──────────────────
    //    Background analyze+decide that persists guidance to
    //    emma_decisions for /api/emma/next-response to consume.
    //    Gated behind EMMA_DECISION_ENGINE_ENABLED='true' (default OFF
    //    in production until Tim verifies it in dev).
    if (process.env.EMMA_DECISION_ENGINE_ENABLED === 'true') {
      console.time(`[Turn] decision-pipeline turn=${turnNumber}`);
      try {
        const { runDecisionEngine } = require('@/lib/emmaDecisionPipeline');
        // Pull the session row's mode + lang + accumulated coverage
        // + last action so the pipeline can build the right context.
        // transcript_data was just appended above so re-read after.
        const sessRes = await db.query(
          `SELECT conversation_mode, transcript_data,
                  dimension_coverage, last_emma_action
             FROM chat_sessions
            WHERE id = $1`,
          [sessionId]
        );
        const sess = sessRes.rows[0] || {};
        const result = await runDecisionEngine({
          db, apiKey,
          userId: user.id, sessionId, turnNumber,
          userMessage: userText || userMessage,
          conversationMode: sess.conversation_mode,
          lang: (user.lang || 'ko'),
          transcript: sess.transcript_data,
          previousCoverage: sess.dimension_coverage,
          lastEmmaAction: sess.last_emma_action,
        });
        console.log(`[Turn] decision result turn=${turnNumber}: ${JSON.stringify(result)}`);
      } catch (e) {
        // Pipeline is fire-and-forget; surface the error in logs but
        // never let it bubble into the rest of the IIFE.
        console.warn(`[Turn] decision pipeline failed turn=${turnNumber}:`, e?.message);
      }
      console.timeEnd(`[Turn] decision-pipeline turn=${turnNumber}`);
    }

    console.timeEnd(`[Turn] bg-total turn=${turnNumber}`);
    console.log(`[Turn] bg work done in ${Date.now() - tWork}ms  total=${Date.now() - t0}ms  turn=${turnNumber}`);
  })().catch(err => console.error('[Turn] bg error:', err?.message));

  // ─── Respond before background work finishes ──────────────────────────────
  console.log(`[Turn] responding in ${Date.now() - t0}ms`);
  return Response.json({ ok: true });
}
