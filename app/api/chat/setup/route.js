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
//  - created_at / updated_at have DB defaults (added 2026-04-24 migration)

// Allow background abandoned-session recovery enough headroom
export const maxDuration = 60;

export async function POST(request) {
  const tSetup0 = Date.now();
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const {
    message = '',
    lang = 'en',
    conversationMode = 'auto',
    continueFragmentId = null,
    // 🆕 Task 60 (Stage 3) — Book mode params
    bookId = null,
    bookQuestionId = null,
  } = await request.json().catch(() => ({}));
  // 🆕 2026-04-25: Continuation sessions are always story mode.
  let effectiveMode = conversationMode;
  if (continueFragmentId) effectiveMode = 'story';
  // 🆕 Book mode is conceptually a story session — same chat_sessions
  //   conversation_mode='STORY' so chat/end's STORY universal save
  //   path applies — but the book_id column on the row + the Helper
  //   system prompt are what differentiate it.
  if (bookId && bookQuestionId) effectiveMode = 'story';
  const safeMode = ['companion', 'story', 'auto'].includes(effectiveMode) ? effectiveMode : 'auto';

  const db = createDb();

  // 🆕 Task 66 — Quota gate. Free-tier users who've used their lifetime
  //   token budget get a 402 with a launching-soon message; the senior
  //   never sees a numeric limit. Tim (tier='unlimited') and any future
  //   premium tier sail through. Failures inside checkQuota fail OPEN.
  {
    const { checkQuota } = require('@/lib/quotaCheck');
    const quota = await checkQuota(db, user.id);
    if (quota.blocked) return Response.json(quota.response, { status: 402 });
  }

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

  // 🆕 Task 60 (Stage 3) — Book context resolution.
  //   When bookId + bookQuestionId are present, we look up the user's
  //   book, find the question in its structure, and capture the prompt
  //   + hint text for the Helper system prompt. Ownership is enforced
  //   by the user_id filter; an unknown book / question hard-fails so
  //   the client can't accidentally persist garbage.
  let bookContext = null;
  if (bookId && bookQuestionId) {
    try {
      const bookRes = await db.query(
        `SELECT structure FROM user_books WHERE id = $1 AND user_id = $2`,
        [bookId, user.id]
      );
      if (bookRes.rows.length === 0) {
        return Response.json({ error: 'book not found' }, { status: 404 });
      }
      const structure = bookRes.rows[0].structure || { chapters: [] };
      let foundQ = null, foundCh = null;
      for (const ch of structure.chapters || []) {
        for (const q of ch.questions || []) {
          if (q.id === bookQuestionId) { foundQ = q; foundCh = ch; break; }
        }
        if (foundQ) break;
      }
      if (!foundQ) {
        return Response.json({ error: 'book question not found' }, { status: 404 });
      }
      const pickI18n = (v) => {
        if (v && typeof v === 'object') return v[lang] || v.ko || v.en || v.es || '';
        return v || '';
      };
      bookContext = {
        bookId,
        bookQuestionId,
        questionPrompt: pickI18n(foundQ.prompt),
        questionHint:   foundQ.hint ? pickI18n(foundQ.hint) : null,
        chapterTitle:   pickI18n(foundCh.title),
        chapterId:      foundCh.id,
      };
    } catch (e) {
      console.error('[chat/setup] book lookup failed:', e.message);
      return Response.json({ error: 'book lookup failed' }, { status: 500 });
    }
  }

  // 🆕 2026-04-25: If continuing an existing root fragment, validate ownership +
  // root-only constraint, then persist the link on the new chat_sessions row.
  let validContinuationParentId = null;
  if (continueFragmentId) {
    try {
      const parentRes = await db.query(
        `SELECT id FROM story_fragments
          WHERE id = $1 AND user_id = $2 AND parent_fragment_id IS NULL`,
        [continueFragmentId, user.id]
      );
      if (parentRes.rows[0]) {
        validContinuationParentId = parentRes.rows[0].id;
      } else {
        console.warn(`[chat/setup] continueFragmentId ${continueFragmentId} not found / not root / not owned`);
      }
    } catch (e) {
      console.warn('[chat/setup] continuation parent lookup failed:', e.message);
    }
  }

  // 1. Create chat session row
  let sessionId;
  console.time('[chat/setup] insert-session');
  try {
    const res = await db.query(
      `INSERT INTO chat_sessions
         (user_id, started_at, conversation_mode, continuation_parent_id,
          book_id, book_question_id, topic_anchor)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6) RETURNING id`,
      [
        user.id,
        conversationModeToDb(safeMode),
        validContinuationParentId,
        bookContext?.bookId || null,
        bookContext?.bookQuestionId || null,
        // For book sessions, the question prompt acts as the topic
        //   anchor so chat/end's STORY-mode logic + downstream
        //   processing have a sensible anchor string.
        bookContext?.questionPrompt || null,
      ]
    );
    sessionId = res.rows[0]?.id;
  } catch (e) {
    console.error('[chat/setup] Failed to create session:', e.message);
    return Response.json({ error: 'DB error creating session' }, { status: 500 });
  }
  console.timeEnd('[chat/setup] insert-session');

  // 2. Build system prompt — Helper for book sessions, Emma otherwise.
  let systemPrompt = '';
  let debugInfo = null;
  if (bookContext) {
    // 🆕 Task 60 (Stage 3) — Helper mode is intentionally austere:
    //   no memory, no story progress, no emotion injection. Just the
    //   single question + its hint. The user is the protagonist of
    //   their book; Helper is the listener.
    const { buildHelperPrompt } = require('@/lib/recallEngine');
    systemPrompt = buildHelperPrompt({
      lang,
      questionPrompt: bookContext.questionPrompt,
      questionHint:   bookContext.questionHint,
    });
    debugInfo = { mode: 'helper', bookId: bookContext.bookId, bookQuestionId: bookContext.bookQuestionId };
  } else {
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
  }
  console.log(`[chat/setup] systemPromptLen=${systemPrompt.length} mode=${bookContext ? 'helper' : safeMode} (warn if >10000)`);
  if (systemPrompt.length > 10_000) {
    console.warn(`[chat/setup] ⚠️ system prompt is ${systemPrompt.length} chars — Gemini Live latency will suffer. Consider tightening recallEngine memory cap.`);
  }

  // Return the server's Gemini API key to authenticated clients (WebSocket use only).
  // The key is never stored in localStorage — only held in React state for the session.
  const geminiKey = process.env.GEMINI_API_KEY || null;

  console.log(`[chat/setup] total=${Date.now() - tSetup0}ms session=${sessionId} mode=${safeMode} lang=${lang}`);
  return Response.json({ sessionId, systemPrompt, debugInfo, geminiKey, conversationMode: safeMode });
}
