#!/usr/bin/env node
/**
 * scripts/recover-fragment.js
 *
 * Re-process a chat_sessions row that should have produced a story
 * fragment but didn't (e.g. STT noise made fragment-detect return
 * detected=false, so the background generator was never queued).
 *
 * Loads the session's transcript_data, runs it through the noise
 * normalizer, calls generateFragmentCloud directly, and INSERTs the
 * resulting fragment into story_fragments.
 *
 * Usage:
 *   PROD_DATABASE_URL="postgresql://..." \
 *   GEMINI_API_KEY="..." \
 *   node scripts/recover-fragment.js <session-uuid>
 *
 * Idempotency: refuses to run if a fragment already exists for the
 * session (check on source_session_ids @> array containing it).
 */

require('dotenv').config({ path: '.env' });

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('usage: node scripts/recover-fragment.js <session-uuid>');
  process.exit(1);
}

const DB_URL  = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
const API_KEY = process.env.GEMINI_API_KEY;

if (!DB_URL)  { console.error('❌ PROD_DATABASE_URL (or DATABASE_URL) not set'); process.exit(1); }
if (!API_KEY) { console.error('❌ GEMINI_API_KEY not set'); process.exit(1); }

const { neon } = require('@neondatabase/serverless');
const { cleanTranscript } = require('../lib/transcriptNoise');
const { fragmentStatusToDb } = require('../lib/enumMappers');

(async () => {
  const sql = neon(DB_URL);

  // 1. Load session
  const sessRows = await sql`
    SELECT id, user_id, conversation_mode, transcript_data, topic_anchor,
           continuation_parent_id, fragment_candidate
    FROM chat_sessions
    WHERE id = ${sessionId}
  `;
  if (sessRows.length === 0) {
    console.error(`❌ Session ${sessionId} not found`);
    process.exit(1);
  }
  const sess = sessRows[0];
  console.log(`📋 Session loaded — user=${sess.user_id} mode=${sess.conversation_mode} fragment_candidate=${sess.fragment_candidate}`);

  // 2. Idempotency check
  const existing = await sql`
    SELECT id, title FROM story_fragments
    WHERE ${sessionId}::uuid = ANY(source_session_ids) AND user_id = ${sess.user_id}
  `;
  if (existing.length > 0) {
    console.error(`⚠️  Fragment already exists for this session: ${existing[0].id} "${existing[0].title}"`);
    console.error('Refusing to create a duplicate. Pass --force to override (not implemented).');
    process.exit(2);
  }

  // 3. Build raw history from transcript_data (already in {role, content} shape)
  const rawHistory = Array.isArray(sess.transcript_data) ? sess.transcript_data : [];
  if (rawHistory.length < 2) {
    console.error(`❌ transcript_data too short (${rawHistory.length} messages)`);
    process.exit(1);
  }

  // 4. Clean transcript
  const { cleaned, originalLen, cleanedLen, noiseRatio, hadNoise, userTurnsKept } =
    cleanTranscript(rawHistory);
  console.log(`🧹 Cleaned — original=${originalLen} → cleaned=${cleanedLen} ratio=${(noiseRatio*100).toFixed(1)}% hadNoise=${hadNoise} userTurnsKept=${userTurnsKept}`);

  if (userTurnsKept < 1) {
    console.error('❌ No substantive user turns after cleaning — nothing to generate');
    process.exit(1);
  }

  // 5. Look up user lang
  const userRows = await sql`SELECT lang FROM "User" WHERE id = ${sess.user_id}`;
  const userLang = (userRows[0]?.lang || 'ko').toLowerCase();

  // 6. Call generateFragmentCloud
  const { generateFragmentCloud } = require('../lib/generateFragmentCloud');

  // For continuation, fetch parent title
  let parentTitle = null;
  let nextThreadOrder = null;
  if (sess.continuation_parent_id) {
    const parentRows = await sql`SELECT title FROM story_fragments WHERE id = ${sess.continuation_parent_id}`;
    parentTitle = parentRows[0]?.title || null;
    const orderRows = await sql`
      SELECT COALESCE(MAX(thread_order), 0) + 1 AS next_order
      FROM story_fragments WHERE parent_fragment_id = ${sess.continuation_parent_id}
    `;
    nextThreadOrder = orderRows[0]?.next_order || 1;
  }

  // generateFragmentCloud uses `db.query()` for fire-and-forget usage
  // logging. logApiUsage swallows errors, so a no-op adapter is fine
  // and keeps the console clean.
  const noopDb = { query: async () => ({ rows: [] }) };
  const sessionMode = (sess.conversation_mode || 'auto').toLowerCase();
  console.log(`🧠 Calling Gemini Flash — lang=${userLang} mode=${sessionMode} continuation=${!!sess.continuation_parent_id}`);

  const fragmentJson = await generateFragmentCloud({
    elements: {},   // No fragment_elements analysis; let Gemini infer from transcript
    transcript: cleaned,
    lang: userLang,
    apiKey: API_KEY,
    db: noopDb,
    userId: sess.user_id,
    sessionId: sess.id,
    conversationMode: sessionMode === 'auto' ? 'story' : sessionMode,  // bias toward story-shape output
    topicAnchor: sess.topic_anchor || null,
    isContinuation: !!sess.continuation_parent_id,
    parentTitle,
  });

  if (!fragmentJson) {
    console.error('❌ generateFragmentCloud returned null');
    process.exit(1);
  }

  console.log(`✅ Fragment generated — title="${fragmentJson.title}" contentLen=${(fragmentJson.content||'').length} truncated=${!!fragmentJson.truncated}`);

  // 7. INSERT
  const wordCount = (fragmentJson.content || '').length;
  const conversationDate = new Date().toISOString().slice(0, 10);
  const truncatedFlag = fragmentJson.truncated ?? false;

  const ins = await sql`
    INSERT INTO story_fragments (
      user_id, title, subtitle, content, content_raw,
      source_session_ids, source_conversation_date,
      tags_era, tags_people, tags_place, tags_theme, tags_emotion,
      word_count, language, status, generated_by, truncated,
      parent_fragment_id, thread_order
    ) VALUES (
      ${sess.user_id},
      ${fragmentJson.title},
      ${fragmentJson.subtitle || null},
      ${fragmentJson.content},
      ${fragmentJson.content},
      ${[sess.id]}::uuid[],
      ${conversationDate}::date,
      ${fragmentJson.tags_era || []},
      ${fragmentJson.tags_people || []},
      ${fragmentJson.tags_place || []},
      ${fragmentJson.tags_theme || []},
      ${fragmentJson.tags_emotion || []},
      ${wordCount},
      ${userLang},
      ${fragmentStatusToDb('draft')},
      'gemini-2.5-flash (recovery)',
      ${truncatedFlag},
      ${sess.continuation_parent_id || null},
      ${nextThreadOrder}
    )
    RETURNING id
  `;
  const newId = ins[0]?.id;
  console.log(`💾 Fragment inserted — id=${newId}`);

  // Mark the session as fragment_candidate=true so audits show it produced one
  await sql`
    UPDATE chat_sessions
    SET fragment_candidate = true
    WHERE id = ${sess.id}
  `;

  console.log('✅ Recovery complete');
})().catch(err => {
  console.error('❌ Recovery failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
