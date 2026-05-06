/**
 * POST   /api/photobooks/[id]/pages/[pageId]/photo  — upload (or replace) page photo
 * DELETE /api/photobooks/[id]/pages/[pageId]/photo  — remove page photo (R2 + DB)
 *
 * Photobook v3 Phase 1 (P3).
 *
 * 패턴 참고:
 *   - app/api/fragments/[id]/photos/route.js  (multipart 'file' 패턴, 컴포넌트 호환)
 *   - app/api/fragments/[id]/audio/route.js   (R2 upload + DB insert + rollback)
 *
 * 차이 (vs fragment_photos):
 *   - 저장소: Vercel Blob → R2 (lib/r2Client.js makePhotoKey/uploadPhoto/deletePhoto)
 *   - 페이지 당 사진 1장 (photobook_page_photos.page_id UNIQUE) — display_order 없음
 *   - PUT 의미: 기존 행 evict 후 재삽입 (UNIQUE 제약 회피)
 *
 * Auth/격리:
 *   - requireAuth + JOIN photobook_pages → user_books (user_id, book_type='photobook')
 *
 * 멀티파트 form fields (PhotoUploader 컴포넌트 호환):
 *   - file        : Blob (image/*)  required
 *   - width       : Int (optional)  — 클라가 압축 후 알면 전달
 *   - height      : Int (optional)  — PDF 레이아웃 비율 계산용
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { makePhotoKey, uploadPhoto, deletePhoto } from '@/lib/r2Client';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB (PhotoUploader 가 클라단에서 1920px 압축 후 보냄)

export const maxDuration = 30;

// ─────────────────────────────────────────────────────────────────
// Helper — verify the page belongs to the user and to a photobook
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
// Helper — pick R2 file extension from MIME
// ─────────────────────────────────────────────────────────────────
function extFromMime(mime) {
  switch (mime) {
    case 'image/png':  return 'png';
    case 'image/webp': return 'webp';
    case 'image/heic': return 'heic';
    case 'image/heif': return 'heif';
    case 'image/jpeg':
    default:           return 'jpg';
  }
}

// ─────────────────────────────────────────────────────────────────
// POST — upload (or replace) the page's photo
// ─────────────────────────────────────────────────────────────────
// page_id UNIQUE 제약: 기존 행이 있으면 R2 객체 + DB 행을 먼저 evict 한 뒤
// INSERT. (UPDATE 로 처리해도 되지만 evict-then-insert 가 fragment_photos
// 와 동일한 패턴이라 정신 부담 적음.)
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

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }

  // Type + size guards.
  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) {
    return NextResponse.json(
      { error: 'Only image files are allowed (jpg, png, webp, heic).' },
      { status: 400 }
    );
  }
  if (typeof file.size === 'number' && file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE_BYTES / 1024 / 1024}MB).` },
      { status: 413 }
    );
  }

  // Optional dimensions (클라가 압축 후 알면 전달; PDF 레이아웃 비율 계산용).
  const widthRaw = form.get('width');
  const heightRaw = form.get('height');
  const width = Number.isFinite(Number(widthRaw)) && Number(widthRaw) > 0 ? Number(widthRaw) : null;
  const height = Number.isFinite(Number(heightRaw)) && Number(heightRaw) > 0 ? Number(heightRaw) : null;

  // ─── Evict existing row + R2 object (page_id UNIQUE 회피) ───
  const existing = await db.query(
    `SELECT id, r2_key FROM photobook_page_photos WHERE page_id = $1`,
    [pageId]
  );
  if (existing.rows.length > 0) {
    const oldRow = existing.rows[0];
    try { await deletePhoto(oldRow.r2_key); }
    catch (e) { console.warn(`[photobook photo POST] R2 delete old failed (${oldRow.r2_key}):`, e?.message); }
    await db.query(`DELETE FROM photobook_page_photos WHERE id = $1`, [oldRow.id]);
  }

  // ─── Upload to R2 ───
  let r2Result;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = makePhotoKey(user.id, pageId, extFromMime(mime));
    r2Result = await uploadPhoto(buffer, key, mime);
  } catch (e) {
    console.error('[photobook photo POST] R2 upload failed:', e?.message);
    return NextResponse.json({ error: 'storage upload failed' }, { status: 502 });
  }

  // ─── INSERT row ───
  try {
    const insert = await db.query(
      `INSERT INTO photobook_page_photos
         (page_id, r2_key, r2_url, width, height, size_bytes, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, page_id, r2_key, r2_url, width, height,
                 size_bytes, mime_type, created_at`,
      [
        pageId,
        r2Result.key,
        r2Result.url,
        width,
        height,
        typeof file.size === 'number' ? file.size : null,
        mime,
      ]
    );
    const photo = insert.rows[0];

    // Bump book last_active_at so list ordering reflects activity.
    await db.query(
      `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
      [photobookId]
    );

    console.log(`[photobook photo POST] page=${pageId} key=${r2Result.key} size=${file.size} (${mime})`);
    return NextResponse.json({ photo }, { status: 201 });
  } catch (e) {
    console.error('[photobook photo POST] db insert failed:', e?.message);
    // Roll back R2 object on DB failure to avoid orphans.
    try { await deletePhoto(r2Result.key); } catch {}
    return NextResponse.json({ error: 'db insert failed' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE — remove the page's photo (R2 + DB)
// ─────────────────────────────────────────────────────────────────
// page_id UNIQUE 라 한 행만 있음. R2 best-effort cleanup, DB 삭제 우선.
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
    `SELECT id, r2_key FROM photobook_page_photos WHERE page_id = $1`,
    [pageId]
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: 'photo not found' }, { status: 404 });
  }

  const row = existing.rows[0];

  // DB delete first (cascade-safe), R2 best-effort.
  await db.query(`DELETE FROM photobook_page_photos WHERE id = $1`, [row.id]);
  try { await deletePhoto(row.r2_key); }
  catch (e) { console.warn(`[photobook photo DELETE] R2 cleanup failed (${row.r2_key}):`, e?.message); }

  // Bump book last_active_at.
  await db.query(
    `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
    [photobookId]
  );

  console.log(`[photobook photo DELETE] page=${pageId} key=${row.r2_key}`);
  return NextResponse.json({ ok: true });
}
