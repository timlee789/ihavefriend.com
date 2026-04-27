#!/usr/bin/env node
/**
 * scripts/analyze-noise-pattern.js
 *
 * Forensic analysis of STT noise bursts inside chat_sessions.transcript_data.
 *
 * Each user turn is decomposed into:
 *   - raw length, cleaned length, noise ratio
 *   - the position WITHIN the turn where the first burst starts
 *   - the dominant repetition unit (1-gram word, 2-gram word, char-cycle)
 *   - count of consecutive repeats at peak
 *   - gibberish-token ratio (Latin/Arabic/non-Hangul fragments)
 *   - text BEFORE the burst (real content) and AFTER the burst (recovery?)
 *
 * Cross-turn signals:
 *   - did the assistant turn after a noisy user turn respond NORMALLY?
 *     (normal assistant turn after noise = model "heard" fine in the next
 *     round-trip = WS not dropped = points to turn-internal STT degeneracy)
 *
 * Usage:
 *   PROD_DATABASE_URL="postgresql://..." \
 *   node scripts/analyze-noise-pattern.js [<session-uuid> ...]
 *
 * If no UUIDs given, analyses all sessions for the user implied by env
 * (or all sessions with non-empty transcript_data, capped at 20).
 */

require('dotenv').config({ path: '.env' });

const DB_URL = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ PROD_DATABASE_URL not set'); process.exit(1); }

const { neon } = require('@neondatabase/serverless');
const { cleanText } = require('../lib/transcriptNoise');

// ─── per-turn analysis helpers ────────────────────────────────

/**
 * Find the first long run of repeated word or 2-gram inside a turn.
 * Returns { startCharIndex, unit, repeats, kind } or null if no burst.
 */
function findFirstBurst(text) {
  const tokens = text.split(/(\s+)/);  // keep separators
  const wordOnly = tokens.filter(t => /\S/.test(t));
  if (wordOnly.length < 4) return null;

  // 1-gram run: scan word array
  for (let i = 0; i < wordOnly.length - 3; i++) {
    let k = 1;
    while (i + k < wordOnly.length && wordOnly[i + k] === wordOnly[i]) k++;
    if (k >= 4) {
      // Map back to char index in original text
      const charIdx = text.indexOf(
        Array(k).fill(wordOnly[i]).join(' ')
      );
      return {
        startCharIndex: charIdx >= 0 ? charIdx : -1,
        unit: wordOnly[i],
        repeats: k,
        kind: '1-gram-word',
      };
    }
  }
  // 2-gram run
  for (let i = 0; i < wordOnly.length - 7; i += 1) {
    const pair = wordOnly[i] + ' ' + wordOnly[i+1];
    let k = 1;
    while (i + 2*k + 1 < wordOnly.length &&
           wordOnly[i + 2*k] === wordOnly[i] &&
           wordOnly[i + 2*k + 1] === wordOnly[i+1]) k++;
    if (k >= 4) {
      const probe = Array(k).fill(pair).join(' ');
      const charIdx = text.indexOf(probe);
      return {
        startCharIndex: charIdx >= 0 ? charIdx : -1,
        unit: pair,
        repeats: k,
        kind: '2-gram-word',
      };
    }
  }
  // Char-cycle (no spaces): "형이형이형이형이"
  const charRe = /(.{1,8}?)\1{3,}/;
  const m = charRe.exec(text);
  if (m) {
    const totalLen = m[0].length;
    const cycleLen = m[1].length;
    return {
      startCharIndex: m.index,
      unit: m[1],
      repeats: Math.floor(totalLen / cycleLen),
      kind: 'char-cycle',
    };
  }
  return null;
}

/**
 * Heuristic gibberish-token ratio over a span of text.
 * Tokens are whitespace-split; a token is "gibberish" if it has < 2
 * Hangul syllables AND isn't a recognizable English word shape.
 */
function gibberishRatio(text) {
  const toks = text.split(/\s+/).filter(Boolean);
  if (toks.length === 0) return 0;
  const isGib = (t) => {
    const core = t.replace(/[\s.,!?…'"`()[\]'""]/g, '');
    if (core.length === 0) return true;
    if (/[가-힣]{2,}/.test(core)) return false;                       // any 2+ Hangul = real
    if (/^[A-Za-z]{3,}$/.test(core) && /[aeiouAEIOU]/.test(core)) return false; // English-ish
    return core.length <= 6;                                            // short non-word = gibberish
  };
  return toks.filter(isGib).length / toks.length;
}

function classifyTurn(text, role) {
  const len = text.length;
  if (len === 0) return null;
  const cleaned = cleanText(text);
  const cleanedLen = cleaned.length;
  const noiseRatio = len > 0 ? (len - cleanedLen) / len : 0;
  const burst = findFirstBurst(text);
  const gib = gibberishRatio(text);

  let preBurstText = null;
  let postBurstText = null;
  if (burst && burst.startCharIndex >= 0) {
    preBurstText = text.slice(0, burst.startCharIndex).trim();
    // Find an approximate end of the burst: where the unit stops repeating.
    // Cheap approach: take cleaned-content tail.
    postBurstText = cleaned.slice(cleaned.indexOf('…') + 1).trim();
  }

  return {
    role,
    len,
    cleanedLen,
    noiseRatioPct: +(noiseRatio * 100).toFixed(1),
    burst,
    gibberishRatioPct: +(gib * 100).toFixed(1),
    preBurst: preBurstText ? preBurstText.slice(-160) : null,
    postBurst: postBurstText ? postBurstText.slice(0, 160) : null,
  };
}

// ─── session-level analysis ──────────────────────────────────

async function analyzeSession(sql, sessionId) {
  const rows = await sql`
    SELECT id, user_id, conversation_mode, fragment_candidate, fragment_elements,
           started_at, ended_at, transcript_data,
           EXTRACT(EPOCH FROM (ended_at - started_at))::int AS duration_s
    FROM chat_sessions WHERE id = ${sessionId}
  `;
  if (rows.length === 0) {
    console.log(`\n❌ session ${sessionId} not found`);
    return;
  }
  const sess = rows[0];
  const transcript = Array.isArray(sess.transcript_data) ? sess.transcript_data : [];

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`Session ${sess.id}`);
  console.log(`  user=${sess.user_id} mode=${sess.conversation_mode} duration=${sess.duration_s}s msgs=${transcript.length}`);
  console.log(`  fragment_candidate=${sess.fragment_candidate} fragment_elements=${JSON.stringify(sess.fragment_elements)}`);

  let totalRaw = 0, totalClean = 0, burstTurns = 0;
  const turnInfos = [];

  transcript.forEach((m, i) => {
    const text = m.content || m.text || '';
    const info = classifyTurn(text, m.role);
    if (!info) return;
    totalRaw   += info.len;
    totalClean += info.cleanedLen;
    if (info.burst) burstTurns++;
    turnInfos.push({ idx: i, ...info });
  });

  console.log(`  totalRawChars=${totalRaw} totalCleaned=${totalClean} sessionNoiseRatio=${((totalRaw-totalClean)/Math.max(1,totalRaw)*100).toFixed(1)}% burstTurns=${burstTurns}`);

  console.log(`\n  ── per-turn breakdown ──`);
  turnInfos.forEach(t => {
    const burstTag = t.burst
      ? ` 🔥 burst@${t.burst.startCharIndex} unit="${t.burst.unit}" ×${t.burst.repeats} (${t.burst.kind})`
      : '';
    console.log(`  [${t.idx}] ${t.role} len=${t.len} clean=${t.cleanedLen} noise=${t.noiseRatioPct}% gib=${t.gibberishRatioPct}%${burstTag}`);
    if (t.burst) {
      if (t.preBurst)  console.log(`        ┌ before burst (last 160ch): "…${t.preBurst}"`);
      if (t.postBurst) console.log(`        └ after  burst (first 160ch): "${t.postBurst}…"`);
    }
  });

  // Cross-turn pattern: did the assistant respond normally AFTER a noisy user turn?
  console.log(`\n  ── cross-turn pattern (post-burst recovery) ──`);
  for (let i = 0; i < turnInfos.length - 1; i++) {
    const cur = turnInfos[i];
    const nxt = turnInfos[i + 1];
    if (cur.role === 'user' && cur.burst && nxt.role === 'assistant') {
      const looksNormal = nxt.len > 8 && nxt.len < 400 && !nxt.burst;
      console.log(`  user[${cur.idx}] burst → assistant[${nxt.idx}] len=${nxt.len} burst=${!!nxt.burst} → ${looksNormal ? '✅ NORMAL response (model heard surrounding context)' : '⚠️ abnormal response'}`);
    }
  }

  // ── Hypothesis evidence summary ───────────────────────────────
  const userBursts = turnInfos.filter(t => t.role === 'user' && t.burst);
  console.log(`\n  ── hypothesis evidence ──`);

  // H1: Gemini Live STT internal hallucination
  //    Signal: turn STARTS with real content, then drops into burst MID-turn
  //            assistant after burst still responds coherently
  const midTurnBursts = userBursts.filter(t => t.burst.startCharIndex > 60);
  const recoveredAfterBurst = userBursts.filter(t => {
    const next = turnInfos.find(x => x.idx === t.idx + 1);
    return next && next.role === 'assistant' && !next.burst && next.len > 8 && next.len < 400;
  });
  console.log(`  H1 (STT internal hallucination): mid-turn bursts=${midTurnBursts.length}/${userBursts.length}, assistant recovered=${recoveredAfterBurst.length}/${userBursts.length}`);

  // H2: WebSocket dropout
  //    Signal: a user turn ENDS abruptly mid-sentence, no assistant response, gap, then new turn
  //    transcript_data has no per-turn timestamps → can only check ending punctuation/length
  const abruptEndings = turnInfos.filter(t =>
    t.role === 'user' && t.len > 30 && !/[.!?。…]\s*$/.test(t.preBurst || '')
  );
  console.log(`  H2 (WebSocket dropout): no per-turn timestamps in transcript_data → cannot prove. abrupt-ending user turns = ${abruptEndings.length}`);

  // H3: Mic input weakening
  //    Signal: a sequence of empty/very-short user turns OR low-confidence pattern
  const veryShort = turnInfos.filter(t => t.role === 'user' && t.len > 0 && t.len < 8);
  console.log(`  H3 (mic weakening): very-short user turns (<8 chars) = ${veryShort.length}`);

  // H4: Gemini API limit/throttle
  //    Signal: error metadata or sudden mode change — not in transcript_data
  console.log(`  H4 (API limit/throttle): not visible from transcript alone — would need server logs`);

  // H5: Context lock — model latched onto a token from earlier in conversation
  //    Signal: burst unit appears earlier in same conversation as a real word
  let h5Hits = 0;
  userBursts.forEach(b => {
    const earlierText = transcript.slice(0, b.idx).map(m => m.content || m.text || '').join(' ');
    if (b.burst.unit && earlierText.includes(b.burst.unit)) h5Hits++;
  });
  console.log(`  H5 (context-token lock): bursts whose unit appears earlier in conversation = ${h5Hits}/${userBursts.length}`);
}

(async () => {
  const sql = neon(DB_URL);
  let ids = process.argv.slice(2);
  if (ids.length === 0) {
    const rows = await sql`
      SELECT id FROM chat_sessions
      WHERE jsonb_array_length(transcript_data) > 0
      ORDER BY started_at DESC LIMIT 20
    `;
    ids = rows.map(r => r.id);
    console.log(`No session ids given — analysing latest ${ids.length} non-empty sessions`);
  }
  for (const id of ids) {
    await analyzeSession(sql, id);
  }
})().catch(e => { console.error('ERR', e.message); console.error(e.stack); process.exit(1); });
