/**
 * POST   /api/photobooks/[id]/pages/[pageId]/audio  — upload (or replace) page audio
 * PATCH  /api/photobooks/[id]/pages/[pageId]/audio  — toggle is_public (sharing on/off)
 * DELETE /api/photobooks/[id]/pages/[pageId]/audio  — remove page audio (R2 + DB)
 *
 * Photobook v3 Phase 1 (P4).
 *
 * 패턴 참고: app/api/fragments/[id]/audio/route.js (음성 시스템 검증된 코드)
 *
 * 차이 (vs fragment_audios):
 *   - 페이지 당 음성 1개 (photobook_page_audios.page_id UNIQUE)
 *     → audio_order 컬럼 없음, 추가 시 기존 행 evict-then-insert
 *   - PATCH 는 단일 행 토글 (fragment_audios 처럼 multi-row 동기화 불필요)
 *   - DELETE 는 단일 행만 (?order 파라미터 없음)
 *
 * 음성 limit (베타와 동일):
 *   - 5분/녹음 (300s)
 *   - 30 recordings per user per day (rolling 24h)
 *   - 30MB 바이트 한도
 *
 * Auth/격리:
 *   - requireAuth + JOIN photobook_pages → user_books (user_id, book_type='photobook')
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import {
  uploadAudio,
  deleteAudio,
  makeAudioKey,
  generatePublicToken,
} from '@/lib/r2Client';

// ─────────────────────────────────────────────────────────────────
// Limits — 음성 시스템 베타와 동일 (Tim 결정 2026-05-06)
// ─────────────────────────────────────────────────────────────────
const MAX_AUDIO_SIZE = 30 * 1024 * 1024;   // 30MB byte ceiling
const MAX_DURATION_SEC = 300;              // 5 minutes per recording
const MAX_AUDIOS_PER_DAY = 30;             // 30 recordings per user per day (across all sources)
const ALLOWED_MIME_PREFIX = 'audio/';

const LIMIT_CODES = {
  TOO_LONG:    'AUDIO_TOO_LONG',
  DAILY_QUOTA: 'DAILY_QUOTA_EXCEEDED',
  TOO_LARGE:   'AUDIO_TOO_LARGE',
};

export const maxDuration = 30;

// ─────────────────────────────────────────────────────────────────
// Helper — verify page belongs to user's photobook
// ─────────────────────────────────────────────────────────────────
async function loadOwnedPage(db, photobookId, pageId, userId) {
  const result = await db.query(
    `SELECT p.id
       FROM photobook_pages p
       JOIN user_books b ON b.id = p.user_book_id
      WHERE p.id = $1
        AND p.user_book_id = $2
        AND b.user_id = $3
        AND b.book_type = 'photobook'`,
    [pageId, photobookId, userId]
  );
  return result.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────
// POST — upload (or replace) page audio + Whisper text
// ─────────────────────────────────────────────────────────────────
// Multipart form fields:
//   audio       : Blob (audio/*)  required
//   duration    : Number (seconds) required
//   whisperText : string (optional) — Whisper transcript from /api/transcribe
//
// page_id UNIQUE 제약: 기존 행이 있으면 R2 + DB row 를 먼저 evict.
// (UPDATE 로 재사용하지 않는 이유: public_token 도 새로 생성해서 이전
// QR 이 갈아치워졌음을 가족에게 알리는 효과가 있음.)
export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId, pageId } = await params;

  if (!photobookId || !pageId) {
    return NextResponse.json({ error: 'photobook id + page id required' }, { status: 400 });
  }

  const db = createDb();

  // Ownership.
  const page = await loadOwnedPage(db, photobookId, pageId, user.id);
  if (!page) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Parse multipart.
  let form;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'invalid form data' }, { status: 400 }); }

  const audio = form.get('audio');
  const durationSec = Number(form.get('duration') || 0);
  const whisperText = form.get('whisperText') || null;

  if (!audio || typeof audio === 'string') {
    return NextResponse.json({ error: 'audio file required' }, { status: 400 });
  }

  // Type + size guards.
  const mime = (audio.type || 'audio/webm').toLowerCase();
  if (!mime.startsWith(ALLOWED_MIME_PREFIX)) {
    return NextResponse.json(
      { error: 'Only audio files are allowed.' },
      { status: 400 }
    );
  }
  if (typeof audio.size === 'number' && audio.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      {
        error: `Audio too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB).`,
        code:  LIMIT_CODES.TOO_LARGE,
      },
      { status: 413 }
    );
  }
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return NextResponse.json({ error: 'invalid duration' }, { status: 400 });
  }

  // ─────── Limit 1: per-recording duration ───────
  if (durationSec > MAX_DURATION_SEC) {
    console.warn(`[photobook audio POST] reject — duration ${durationSec}s > ${MAX_DURATION_SEC}s limit (user=${user.id})`);
    return NextResponse.json(
      {
        error:    `Recording exceeds ${MAX_DURATION_SEC / 60} minute limit.`,
        code:     LIMIT_CODES.TOO_LONG,
        max_sec:  MAX_DURATION_SEC,
        actual:   durationSec,
      },
      { status: 429 }
    );
  }

  // ─────── Limit 2: per-user per-day count ───────
  // Counts in this table only; fragment_audios has its own daily quota.
  // Two separate quotas are intentional — a heavy photobook user shouldn't
  // get throttled out of voice journaling and vice versa.
  const dailyRow = await db.query(
    `SELECT COUNT(*)::int AS cnt
       FROM photobook_page_audios
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '24 hours'`,
    [user.id]
  );
  const dailyCount = dailyRow.rows[0]?.cnt || 0;
  if (dailyCount >= MAX_AUDIOS_PER_DAY) {
    console.warn(`[photobook audio POST] reject — user ${user.id} already has ${dailyCount} audios in 24h (limit ${MAX_AUDIOS_PER_DAY})`);
    return NextResponse.json(
      {
        error:   `Daily recording limit (${MAX_AUDIOS_PER_DAY}) reached. Try again tomorrow.`,
        code:    LIMIT_CODES.DAILY_QUOTA,
        max:     MAX_AUDIOS_PER_DAY,
        current: dailyCount,
      },
      { status: 429 }
    );
  }

  // ─────── Evict existing row + R2 (page_id UNIQUE) ───────
  const existing = await db.query(
    `SELECT id, r2_key FROM photobook_page_audios WHERE page_id = $1`,
    [pageId]
  );
  if (existing.rows.length > 0) {
    const oldRow = existing.rows[0];
    try { await deleteAudio(oldRow.r2_key); }
    catch (e) { console.warn(`[photobook audio POST] R2 delete old failed (${oldRow.r2_key}):`, e?.message); }
    await db.query(`DELETE FROM photobook_page_audios WHERE id = $1`, [oldRow.id]);
  }

  // ─────── Upload to R2 ───────
  let r2Result;
  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    // page_id 를 fragmentId 자리에 넣어 키 prefix 구분 (audios/u_X/f_<pageId>/...).
    // 'f_' prefix 가 fragment 와 photobook 페이지를 섞어 보이게 하지만 page_id
     // 는 UUID 라 충돌 없음. 미래에 'p_' prefix 로 분리 가능.
    const key = makeAudioKey(user.id, pageId);
    r2Result = await uploadAudio(buffer, key, mime);
  } catch (e) {
    console.error('[photobook audio POST] R2 upload failed:', e?.message);
    return NextResponse.json({ error: 'storage upload failed' }, { status: 502 });
  }

  // ─────── INSERT DB row ───────
  try {
    const publicToken = generatePublicToken();
    const result = await db.query(
      `INSERT INTO photobook_page_audios
         (page_id, user_id, r2_key, r2_url,
          duration_sec, size_bytes, mime_type, whisper_text, public_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, page_id, duration_sec, size_bytes, mime_type,
                 whisper_text, public_token, is_public, play_count,
                 first_played_at, last_played_at, created_at, updated_at`,
      [
        pageId,
        user.id,
        r2Result.key,
        r2Result.url,
        durationSec,
        audio.size || 0,
        mime,
        whisperText,
        publicToken,
      ]
    );
    const row = result.rows[0];

    // 🔥 v3 결정: Whisper 결과를 페이지 caption_raw 에도 자동 저장.
    // caption (사용자 편집본) 은 건드리지 않음 — 사용자가 이미 직접 입력했을
    // 수 있으므로. caption 이 비어 있으면 caption_raw 를 caption 으로 복사
    // 하는 정책은 프론트에서 결정하는 게 더 명확해서 여기선 안 함.
    if (whisperText) {
      await db.query(
        `UPDATE photobook_pages
            SET caption_raw = $1
          WHERE id = $2`,
        [String(whisperText).slice(0, 5000), pageId]
      );
    }

    // Bump book last_active_at.
    await db.query(
      `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
      [photobookId]
    );

    console.log(
      `[photobook audio POST] page=${pageId} duration=${durationSec}s ` +
      `size=${audio.size} key=${r2Result.key} token=${publicToken}`
    );
    return NextResponse.json({ audio: row }, { status: 201 });
  } catch (e) {
    console.error('[photobook audio POST] db write failed:', e?.message);
    // Roll back R2 on DB failure.
    try { await deleteAudio(r2Result.key); } catch {}

    if (e?.code === '23505') {
      // page_id UNIQUE race — extremely unlikely (we just evicted) but
      // returning 409 lets the client retry cleanly.
      return NextResponse.json(
        { error: 'concurrent upload — please retry', code: 'RACE_CONDITION' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'db write failed' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// PATCH — toggle is_public (sharing on/off)
// ─────────────────────────────────────────────────────────────────
// Body: { is_public: boolean }
// Single row update (page_id UNIQUE). 끄면 /api/audio/[token] 와
// /api/listen/[token] 가 즉시 404 로 떨어져 가족 측 재생도 멈춤.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId, pageId } = await params;

  if (!photobookId || !pageId) {
    return NextResponse.json({ error: 'photobook id + page id required' }, { status: 400 });
  }

  let body = {};
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  if (typeof body.is_public !== 'boolean') {
    return NextResponse.json(
      { error: 'is_public (boolean) required' },
      { status: 400 }
    );
  }

  const db = createDb();

  // Ownership + update in one query (subquery 로 격리).
  const result = await db.query(
    `UPDATE photobook_page_audios
        SET is_public  = $1,
            updated_at = NOW()
      WHERE page_id = $2
        AND page_id IN (
          SELECT p.id
            FROM photobook_pages p
            JOIN user_books b ON b.id = p.user_book_id
           WHERE b.user_id = $3
             AND b.book_type = 'photobook'
             AND p.user_book_id = $4
        )
    RETURNING id, page_id, duration_sec, size_bytes, mime_type,
              whisper_text, public_token, is_public, play_count,
              first_played_at, last_played_at, created_at, updated_at`,
    [body.is_public, pageId, user.id, photobookId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'not found or forbidden' }, { status: 404 });
  }

  console.log(`[photobook audio PATCH] page=${pageId} is_public=${body.is_public}`);
  return NextResponse.json({ audio: result.rows[0] });
}

// ─────────────────────────────────────────────────────────────────
// DELETE — remove page audio (R2 + DB)
// ─────────────────────────────────────────────────────────────────
// page_id UNIQUE 라 한 행만 있음. DB 삭제 우선, R2 best-effort.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: photobookId, pageId } = await params;

  if (!photobookId || !pageId) {
    return NextResponse.json({ error: 'photobook id + page id required' }, { status: 400 });
  }

  const db = createDb();

  // Ownership.
  const page = await loadOwnedPage(db, photobookId, pageId, user.id);
  if (!page) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Fetch row for R2 key.
  const existing = await db.query(
    `SELECT id, r2_key FROM photobook_page_audios WHERE page_id = $1`,
    [pageId]
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: 'audio not found' }, { status: 404 });
  }

  const row = existing.rows[0];

  await db.query(`DELETE FROM photobook_page_audios WHERE id = $1`, [row.id]);
  try { await deleteAudio(row.r2_key); }
  catch (e) { console.warn(`[photobook audio DELETE] R2 cleanup failed (${row.r2_key}):`, e?.message); }

  // Bump book last_active_at.
  await db.query(
    `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
    [photobookId]
  );

  console.log(`[photobook audio DELETE] page=${pageId} key=${row.r2_key}`);
  return NextResponse.json({ ok: true });
}
