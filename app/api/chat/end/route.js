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
 *
 * 2026-04-23 v2 schema migration:
 *  - Fragment INSERT: status 'draft' → fragmentStatusToDb('draft') = 'DRAFT'
 *  - conversation_mode read: DB returns uppercase enum, compared after toLowerCase()
 *  - This is THE critical path: Emma conversation → Fragment → Book
 */
import { requireAuth, verifyToken } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { after } from 'next/server';
import { fragmentStatusToDb } from '@/lib/enumMappers';
import { cleanTranscript, buildConversationSample, hadBurst } from '@/lib/transcriptNoise';

// Allow the background fragment-generation task (Gemini Flash call + INSERT)
// enough time to finish on Vercel Hobby before the lambda is frozen.
export const maxDuration = 60;

export async function POST(request) {
  const tEnter = Date.now();
  // API key comes from server env — never from client
  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`[chat/end] POST entered at ${tEnter} — hasApiKey=${!!apiKey} env=${process.env.VERCEL_ENV || 'local'}`);

  // Read body first (sendBeacon can't send Authorization header)
  let body = {};
  try {
    const text = await request.text();
    body = JSON.parse(text);
  } catch {}

  const {
    sessionId,
    transcript: clientTranscript = [],
    _token,
    conversationMode = 'auto',
    // 🔥 Task 80 — Whisper-based recovery transcript for the user
    //   side of the conversation. When present and non-trivial,
    //   replaces the user turns from Gemini Live (which silently
    //   truncates long Korean monologues). Emma's turns from the
    //   real-time path are preserved as-is.
    whisperTranscript = null,
  } = body;

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
  let topicAnchor = null; // 🆕 2026-04-24
  let continuationParentId = null; // 🆕 2026-04-25
  let bookId = null;          // 🆕 Task 60 (Stage 3) — book mode marker
  let bookQuestionId = null;  // 🆕 Task 60
  try {
    const modeRow = await db.query(
      `SELECT conversation_mode, topic_anchor, continuation_parent_id, book_id, book_question_id FROM chat_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, user.id]
    );
    const dbMode = modeRow.rows[0]?.conversation_mode;
    topicAnchor = modeRow.rows[0]?.topic_anchor || null; // 🆕
    continuationParentId = modeRow.rows[0]?.continuation_parent_id || null; // 🆕 2026-04-25
    bookId = modeRow.rows[0]?.book_id || null;                              // 🆕 Task 60
    bookQuestionId = modeRow.rows[0]?.book_question_id || null;             // 🆕 Task 60
    // v2: conversation_mode is now ConversationMode enum → DB returns UPPERCASE.
    // Convert to lowercase for case-insensitive biz-logic comparison.
    const dbModeLower = dbMode?.toLowerCase();
    if (dbModeLower && dbModeLower !== 'auto') sessionMode = dbModeLower; // DB wins if set
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
  let rawHistory = transcript.map(t => ({
    role: t.role === 'user' ? 'user' : 'assistant',
    content: t.text || t.content || '',
  }));

  // 🔥 Task 80 — apply the Whisper recovery transcript when it's
  //   long enough to matter. Threshold of 200 chars keeps this from
  //   clobbering a real (but short) conversation with Whisper's
  //   "you you you you" tic on near-silence. We collapse all the
  //   user turns into a single aggregate message that contains the
  //   full Whisper text, while keeping every Emma turn in place at
  //   its original position so the question→answer cadence still
  //   reads correctly downstream.
  const usingWhisper =
    typeof whisperTranscript === 'string' &&
    whisperTranscript.trim().length >= 200;
  if (usingWhisper) {
    const aiTurns = rawHistory.filter(m => m.role === 'assistant');
    const before  = rawHistory.filter(m => m.role === 'user').reduce((n, m) => n + (m.content || '').length, 0);
    rawHistory = [
      { role: 'user', content: whisperTranscript.trim() },
      ...aiTurns,
    ];
    console.log(
      `[chat/end] 🎤 whisper override active — userChars ${before} → ${whisperTranscript.length} ` +
      `(kept ${aiTurns.length} assistant turns)`
    );
  }

  // 🆕 2026-04-27 (Task 47): Normalise STT noise BEFORE any LLM call.
  // ASR repetition collapse ("어디 어디 어디 …" ×500) can dominate the
  // 3000–4000 char truncation window used by fragment-detect and
  // generateFragmentCloud. We collapse those runs and cap implausibly
  // long single turns so downstream stages see real content.
  const { cleaned: history, noiseRatio, hadNoise, userTurnsKept, originalLen, cleanedLen } =
    cleanTranscript(rawHistory);
  if (hadNoise) {
    console.warn(`[chat/end] ⚠️ STT noise detected — original=${originalLen} cleaned=${cleanedLen} ratio=${(noiseRatio*100).toFixed(1)}% userTurnsKept=${userTurnsKept}`);
  }

  // 🆕 Task 47 #4 — STT quality telemetry. Compute per-session signals and
  // persist on chat_sessions for downstream analytics. Fire-and-forget; an
  // analytics-write failure must never block memory extraction.
  try {
    const noisyTurnCount = rawHistory.reduce((n, m) => {
      if (m.role !== 'user') return n;
      // Use hadBurst (full-text retrospective scan) — detectBurst is
      // tail-only and would miss bursts that the user spoke past.
      return hadBurst(m.content || '') ? n + 1 : n;
    }, 0);
    const sttQualityScore = originalLen > 0
      ? Math.max(0, Math.min(1, 1 - noiseRatio))
      : null;
    await db.query(
      `UPDATE chat_sessions
         SET stt_quality_score = $1,
             noisy_turn_count  = $2
       WHERE id = $3`,
      [sttQualityScore, noisyTurnCount, sessionId]
    );
    console.log(`[chat/end] 📊 telemetry — sttQualityScore=${sttQualityScore?.toFixed(3) ?? 'null'} noisyTurnCount=${noisyTurnCount}`);
  } catch (telErr) {
    console.warn('[chat/end] telemetry write failed (non-fatal):', telErr.message);
  }

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

  // ── Fragment detection + universal save gate ────────────────────────
  // 🔥 Task 56 (2026-04-28): the gate decision is now made BEFORE any
  //   network call to Gemini. This is the structural fix for the
  //   "STORY 5분 이야기 사라짐" regression — previously the entire
  //   shouldQueue logic lived inside `if (geminiRes.ok)`, so any
  //   fragment-detect timeout / network blip / JSON parse error
  //   silently dropped the user's story even when their intent was
  //   unambiguous. Now:
  //
  //     STORY mode + safety net  →  shouldQueue = true   (user-intent override)
  //     Continuation + ≥2 turns  →  shouldQueue = true   (explicit click)
  //     Companion / auto         →  Gemini detect required (best-effort)
  //
  //   Personality is a request, the gate is a guarantee.
  let fragmentJobId = null;
  let fragment = null;            // populated by Gemini detect when it succeeds
  let shouldQueue = false;
  let generationReason = '';

  const isContinuation     = !!continuationParentId;
  const userTurnCount      = history.filter(m => m.role === 'user').length;
  const userCharCount      = history.filter(m => m.role === 'user')
                                    .reduce((s, m) => s + (m.content || '').length, 0);
  // 🔥 Task 78 diagnostic — print every user turn's length so we can
  //   verify the truncation cap isn't biting legit Korean monologues.
  //   Look for these in Vercel logs after Tim's recording test.
  if (history.length > 0) {
    const userTurnLengths = history
      .filter(m => m.role === 'user')
      .map((m, i) => `t${i}=${(m.content || '').length}`);
    console.log(`[chat/end] 📏 user turns lens: [${userTurnLengths.join(', ')}] total=${userCharCount}`);
  }
  const continuationMinTurns = 2;
  const STORY_MIN_USER_TURNS = 2;
  const STORY_MIN_USER_CHARS = 100;

  // 🔥 Task 80b — when the Whisper override fired, all of the user
  //   side collapses into a SINGLE aggregate turn, which fails the
  //   pre-Whisper STORY_MIN_USER_TURNS=2 gate every time. The intent
  //   ("user spoke a story") is unmistakable when the aggregate
  //   carries 200+ chars, so we treat usingWhisper as a turn-count
  //   bypass and let userCharCount be the only signal. Continuation
  //   gets the same treatment so a Whispered "이어서 말하기" doesn't
  //   regress. Companion/auto stays Gemini-detect-driven, but with
  //   a higher char floor (500) so a Whisper recovery on a casual
  //   chat still lands a fragment.
  const WHISPER_MIN_CHARS = 200;
  const WHISPER_AUTO_MIN_CHARS = 500;
  if (isContinuation && (
    userTurnCount >= continuationMinTurns ||
    (usingWhisper && userCharCount >= WHISPER_MIN_CHARS)
  )) {
    shouldQueue = true;
    generationReason = usingWhisper && userTurnCount < continuationMinTurns
      ? `continuation whisper_override chars=${userCharCount}`
      : `continuation user_intent_override turns=${userTurnCount}`;
  } else if (sessionMode === 'story' && (
    (userTurnCount >= STORY_MIN_USER_TURNS && userCharCount >= STORY_MIN_USER_CHARS) ||
    (usingWhisper && userCharCount >= WHISPER_MIN_CHARS)
  )) {
    shouldQueue = true;
    generationReason = usingWhisper
      ? `STORY whisper_override chars=${userCharCount}`
      : `STORY user_intent_override turns=${userTurnCount} chars=${userCharCount}`;
  } else if (
    (sessionMode === 'companion' || sessionMode === 'auto') &&
    usingWhisper &&
    userCharCount >= WHISPER_AUTO_MIN_CHARS
  ) {
    shouldQueue = true;
    generationReason = `${sessionMode.toUpperCase()} whisper_override chars=${userCharCount}`;
  }

  // 🆕 Task 66 — Quota gate. We always let chat/end run so the wrap-up
  //   bookkeeping (transcript save, ended_at stamp) happens, but if the
  //   user has crossed their lifetime token budget we suppress the
  //   expensive fragment-generation path. Any LLM detect work below is
  //   wrapped by `if (apiKey && history.length >= 2)` so dropping
  //   shouldQueue is enough to keep this turn cheap.
  if (shouldQueue) {
    try {
      const { checkQuota } = require('@/lib/quotaCheck');
      const quota = await checkQuota(db, user.id);
      if (quota.blocked) {
        console.log(`[chat/end] quota exceeded — skip fragment gen for user=${user.id}`);
        shouldQueue = false;
        generationReason = `quota_blocked (${quota.used}/${quota.limit})`;
      }
    } catch (e) {
      console.warn('[chat/end] quota check failed (allowing through):', e?.message);
    }
  }

  console.log(`[chat/end] Pre-detect gate: shouldQueue=${shouldQueue} mode=${sessionMode} whisper=${usingWhisper} continuation=${isContinuation} userTurns=${userTurnCount} userChars=${userCharCount} reason="${generationReason}"`);

  if (apiKey && history.length >= 2) {
    try {
      // 🆕 2026-04-27 (Task 47 #5): replace brittle substring(0, 3000) with
      // a sampler that prioritises user turns and caps any single turn so
      // one giant noisy message can't starve the rest of the context.
      // 🔥 Task 57 (Fix 1-extra): bumped from 3000 → 6000 so the detect
      //   prompt actually sees the second half of a 5+ minute Korean
      //   conversation. The detect call only needs to spot story-shape
      //   signals, not reproduce the whole transcript, so even 6000 is
      //   generous; we left headroom under Gemini Flash's input limit.
      const conversationText = buildConversationSample(history, {
        maxChars: 6000,
        userLabel: '사용자',
        assistantLabel: 'Emma',
      });

      const analysisPrompt = `Analyze this conversation between a user and Emma (AI friend) for story-worthy moments.

A story-worthy moment has specific WHEN, WHERE, WHO, WHAT, EMOTION, or WHY elements.

Conversation:
${conversationText}

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

      const tDetect = Date.now();
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

      // 🆕 Log fragment-detection API usage (fire-and-forget)
      try {
        const { logApiUsage } = require('@/lib/apiUsage');
        if (geminiRes.ok) {
          const clone = geminiRes.clone();
          const peek = await clone.json().catch(() => ({}));
          await logApiUsage(db, {
            userId: user.id, sessionId,
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            operation: 'fragment_detect',
            usageMetadata: peek.usageMetadata,
            latencyMs: Date.now() - tDetect,
            success: true,
          });
        } else {
          await logApiUsage(db, {
            userId: user.id, sessionId,
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            operation: 'fragment_detect',
            latencyMs: Date.now() - tDetect,
            success: false,
            errorCode: `http_${geminiRes.status}`,
          });
        }
      } catch {}

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(raw.trim());
        fragment = parsed.fragment;

        // companion / auto: only path that depends on Gemini detect.
        // STORY + continuation are already decided above and never
        // demoted by Gemini's verdict.
        if (!shouldQueue && !isContinuation && sessionMode !== 'story') {
          if (fragment?.detected && (fragment?.completeness ?? 0) >= 2) {
            shouldQueue = true;
            generationReason = `${sessionMode} detected=${fragment.detected} completeness=${fragment.completeness}`;
          } else {
            generationReason = `${sessionMode} insufficient (detected=${fragment?.detected} completeness=${fragment?.completeness ?? 0})`;
          }
        }
      }
    } catch (e) {
      console.error('[chat/end] fragment-detect failed (non-fatal for STORY/continuation):', e.message);
      // STORY + continuation already had shouldQueue decided above —
      // this catch must NOT touch shouldQueue.
    }
  }

  console.log(`[chat/end] Final gate decision: ${shouldQueue ? '✅ GENERATE' : '❌ SKIP'} — ${generationReason} (geminiFragment=${!!fragment})`);

  if (shouldQueue) {
    try {
      // 🔥 Task 56 (c): idempotency. /api/chat/end can be called more
      //   than once for the same session (visibilitychange beacon +
      //   beforeunload beacon + forceStop unmount beacon all fire on
      //   navigation). Confirmed in production: session f2d04e14
      //   produced 3 fragments 5–43 s apart. Skip if a root fragment
      //   already exists — the partial unique index in migration
      //   20260428_2 is the database-level safety net for the case
      //   where two concurrent INSERTs both pass this check.
      const existing = await db.query(
        `SELECT id FROM story_fragments
          WHERE user_id = $1
            AND source_session_ids @> ARRAY[$2]::uuid[]
            AND parent_fragment_id IS NULL
          LIMIT 1`,
        [user.id, sessionId]
      );
      if (existing.rows.length > 0) {
        console.log(`[chat/end] ⏭ Fragment already exists for session ${sessionId} (${existing.rows[0].id}) — skipping duplicate save`);
        return Response.json({ ok: true, memoriesExtracted: result.memoriesExtracted || 0, fragmentJobQueued: false, alreadyExists: true });
      }

      // Step 1: Mark session as fragment candidate. fragment may be null
      //   (Gemini failed) — store empty object so downstream introspection
      //   doesn't NPE; generateFragmentCloud falls back to deriving
      //   elements from the transcript itself.
      await db.query(
        `UPDATE chat_sessions
           SET fragment_candidate = true,
               fragment_elements  = $1
         WHERE id = $2`,
        [JSON.stringify(fragment || { user_intent: true, mode: sessionMode }), sessionId]
      );
      console.log(`[chat/end] ✅ fragment_candidate=true set for session ${sessionId}`);

          // Step 2: Generate fragment via Gemini Flash in the background.
          // Use Next.js `after()` so Vercel keeps the function alive past the
          // response — a bare Promise gets killed on Hobby plan when the
          // lambda freezes. Errors are logged; response cannot be affected.
          fragmentJobId = `cloud-${sessionId}`;

          const userLang  = (user.lang || 'ko').toLowerCase();
          const bgHistory = history;
          const userId    = user.id;

          console.log(`[chat/end] Fragment generation starting — session=${sessionId} user=${userId} lang=${userLang} hasApiKey=${!!apiKey} transcriptLen=${bgHistory.length}`);

          after(async () => {
            const bgStart = Date.now();
            try {
              const { generateFragmentCloud } = require('@/lib/generateFragmentCloud');

              const fragmentElements = fragment?.elements || fragment;
              const userMsgCount = bgHistory.filter(m => m.role === 'user').length;
              const elementKeys = Object.keys(fragmentElements || {})
                .filter(k => {
                  const v = fragmentElements[k];
                  return v && (Array.isArray(v) ? v.length > 0 : true);
                })
                .join(',');
              console.log(`[chat/end:bg] calling generateFragmentCloud — userId=${userId} session=${sessionId} userMsgs=${userMsgCount} elements=[${elementKeys}] completeness=${fragment?.completeness}`);

              // 🆕 2026-04-25: Continuation context — fetch parent title once,
              //                used both by the prompt and for thread_order assignment.
              let parentTitle = null;
              let nextThreadOrder = null;
              if (continuationParentId) {
                try {
                  const parentRow = await db.query(
                    `SELECT title FROM story_fragments WHERE id = $1`,
                    [continuationParentId]
                  );
                  parentTitle = parentRow.rows[0]?.title || null;
                  const orderRes = await db.query(
                    `SELECT COALESCE(MAX(thread_order), 0) + 1 AS next_order
                       FROM story_fragments
                      WHERE parent_fragment_id = $1`,
                    [continuationParentId]
                  );
                  nextThreadOrder = orderRes.rows[0]?.next_order || 1;
                } catch (e) {
                  console.warn('[chat/end:bg] continuation parent lookup failed:', e.message);
                }
              }

              const fragmentJson = await generateFragmentCloud({
                elements:   fragmentElements,
                transcript: bgHistory,
                lang:       userLang,
                apiKey,
                db,                 // 🆕 usage logging
                userId,
                sessionId,
                conversationMode: sessionMode,  // 🆕 'auto' | 'companion' | 'story'
                topicAnchor,                    // 🆕 2026-04-24: user-declared topic
                isContinuation: !!continuationParentId, // 🆕 2026-04-25
                parentTitle,                            // 🆕 2026-04-25
              });

              if (!fragmentJson) {
                console.error(`[chat/end:bg] ❌ generateFragmentCloud returned null — session=${sessionId} elapsed=${Date.now() - bgStart}ms`);
                return;
              }

              const conversationDate = new Date().toISOString().slice(0, 10);
              const wordCount = (fragmentJson.content || '').length;

              // Propagate the MAX_TOKENS truncation flag from generateFragmentCloud.
              // `?? false` is a belt-and-suspenders fallback: generateFragmentCloud
              // always returns an explicit boolean, but older cached builds or
              // future refactors could theoretically omit the field.
              const truncatedFlag = fragmentJson.truncated ?? false;

              console.log(`[chat/end:bg] INSERT story_fragments — session=${sessionId} title="${fragmentJson.title}" subtitleLen=${fragmentJson.subtitle?.length ?? 0} contentLen=${wordCount} tagsTheme=${fragmentJson.tags_theme?.length ?? 0} truncated=${truncatedFlag}`);

              const insertRes = await db.query(
                `INSERT INTO story_fragments
                   (user_id, title, subtitle, content, content_raw,
                    source_session_ids, source_conversation_date,
                    tags_era, tags_people, tags_place, tags_theme, tags_emotion,
                    word_count, language, status, generated_by, truncated,
                    parent_fragment_id, thread_order,
                    book_id, book_question_id)
                 VALUES ($1, $2, $3, $4, $5,
                         $6::uuid[], $7,
                         $8, $9, $10, $11, $12,
                         $13, $14, $15, $16, $17,
                         $18, $19,
                         $20, $21)
                 RETURNING id`,
                [
                  userId,
                  fragmentJson.title,
                  fragmentJson.subtitle,
                  fragmentJson.content,
                  fragmentJson.content,              // content_raw = initial LLM draft
                  [sessionId],
                  conversationDate,
                  fragmentJson.tags_era,
                  fragmentJson.tags_people,
                  fragmentJson.tags_place,
                  fragmentJson.tags_theme,
                  fragmentJson.tags_emotion,
                  wordCount,
                  userLang,
                  fragmentStatusToDb('draft'),       // $15 — 'DRAFT' (v2 enum)
                  'gemini-2.5-flash',                // $16
                  truncatedFlag,                     // $17
                  continuationParentId,              // $18 🆕 2026-04-25
                  nextThreadOrder,                   // $19 🆕 2026-04-25
                  bookId,                            // $20 🆕 Task 60 Stage 3
                  bookQuestionId,                    // $21 🆕 Task 60 Stage 3
                ]
              );

              const newFragmentId = insertRes.rows[0]?.id;
              console.log(`[chat/end:bg] ✅ Fragment inserted id=${newFragmentId} session=${sessionId} contentLen=${wordCount} title="${fragmentJson.title}" truncated=${truncatedFlag} bookId=${bookId || '-'} bgTotal=${Date.now() - bgStart}ms`);

              // 🆕 Task 60 (Stage 3) — Book question mapping.
              //   Append fragmentId to the response row, flip its status
              //   from 'empty' to 'complete' on first save (preserve any
              //   custom status set by Stage 4 customisation), set
              //   selected_fragment_id if not already chosen, and bump
              //   the parent book's completed_questions counter.
              if (newFragmentId && bookId && bookQuestionId) {
                try {
                  await db.query(
                    `UPDATE user_book_responses
                        SET fragment_ids         = array_append(fragment_ids, $1::uuid),
                            status               = CASE WHEN status = 'empty' THEN 'complete' ELSE status END,
                            selected_fragment_id = COALESCE(selected_fragment_id, $1::uuid),
                            first_answered_at    = COALESCE(first_answered_at, NOW()),
                            last_updated_at      = NOW()
                      WHERE book_id = $2 AND question_id = $3`,
                    [newFragmentId, bookId, bookQuestionId]
                  );
                  await db.query(
                    `UPDATE user_books
                        SET completed_questions = (
                              SELECT COUNT(*) FROM user_book_responses
                               WHERE book_id = $1 AND status = 'complete'
                            ),
                            last_active_at = NOW()
                      WHERE id = $1`,
                    [bookId]
                  );
                  console.log(`[chat/end:bg] 📚 Book response mapped — book=${bookId} q=${bookQuestionId} fragment=${newFragmentId}`);
                } catch (mapErr) {
                  console.error('[chat/end:bg] book response mapping failed:', mapErr.message);
                }
              }
            } catch (bgErr) {
              // 🔥 Task 56 (c): unique-constraint hit means a sibling
              //   request already INSERTed a fragment for this session
              //   while we were in flight. That's the desired behaviour
              //   — log quietly instead of stack-tracing.
              const isDup = bgErr?.code === '23505' ||
                            /duplicate key|story_fragments_unique_session_root/i.test(bgErr?.message || '');
              if (isDup) {
                console.log(`[chat/end:bg] ⏭ Concurrent INSERT lost the race for session ${sessionId} — fragment already saved by sibling request`);
              } else {
                console.error(`[chat/end:bg] ❌ Fragment generation threw for session ${sessionId}:`, bgErr?.message);
                console.error(bgErr?.stack);
              }
            }
          });
    } catch (e) {
      console.error('[chat/end] shouldQueue path failed:', e.message);
    }
  } else {
    console.log(`[chat/end] No fragment generated for session ${sessionId} — ${generationReason}`);
  }

  return Response.json({ ok: true, memoriesExtracted: result.memoriesExtracted || 0, fragmentJobQueued: !!fragmentJobId });
}
