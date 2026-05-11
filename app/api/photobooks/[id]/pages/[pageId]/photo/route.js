/**
 * POST   /api/photobooks/[id]/pages/[pageId]/photo  — upload (or replace) page photo
 * DELETE /api/photobooks/[id]/pages/[pageId]/photo  — remove page photo (R2 + DB)
 *
 * Photobook v3 Phase 1 (P3) + R0 (original-photo storage, 2026-05-06).
 *
 * 패턴 참고:
 *   - app/api/fragments/[id]/photos/route.js  (multipart 'file' 패턴)
 *   - app/api/fragments/[id]/audio/route.js   (R2 upload + DB insert + rollback)
 *
 * 차이 (vs fragment_photos):
 *   - 저장소: Vercel Blob → R2 (lib/r2Client.js makePhotoKey/uploadPhoto/deletePhoto)
 *   - 페이지 당 사진 1장 (photobook_page_photos.page_id UNIQUE) — display_order 없음
 *   - 교체 의미: 기존 행 evict 후 재삽입 (UNIQUE 제약 회피)
 *
 * 🔥 R0 (2026-05-06) — 원본 보존 (인쇄 PDF 품질 보장).
 *   클라가 압축본 (display, 1920px JPEG 80%) + 원본 (print, 4096px JPEG 95%
 *   + EXIF 회전 적용된 JPEG) 두 파일을 multipart 로 보낸다. 서버는 둘 다
 *   R2 에 병렬 업로드. 압축본은 필수, 원본은 best-effort (실패 시 압축본
 *   만으로 row 작성). 두 R2 객체 모두 페이지 삭제/교체 시 정리.
 *
 * Auth/격리:
 *   - requireAuth + JOIN photobook_pages → user_books (user_id, book_type='photobook')
 *
 * 멀티파트 form fields:
 *   file            : Blob (image/*)  required  — 압축본 (display)
 *   width, height   : Int (optional)            — 압축본 픽셀 크기
 *   fileOriginal    : Blob (image/*)  optional  — 원본 (print)
 *   originalWidth   : Int (optional)            — 원본 픽셀 크기
 *   originalHeight  : Int (optional)
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkQuotaOrError } from '@/lib/quotas';
import { createDb } from '@/lib/db';
import {
  makePhotoKey,
  makeOriginalPhotoKey,
  uploadPhoto,
  deletePhoto,
} from '@/lib/r2Client';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_SIZE_BYTES = 8 * 1024 * 1024;            // 압축본 한도 (~1920px JPEG 80%)
const MAX_ORIGINAL_SIZE_BYTES = 25 * 1024 * 1024;  // 원본 한도 (4K JPEG 95% ≈ 5-10MB typical)

// 🔥 R0 — 원본 업로드까지 합쳐서 더 여유롭게 (병렬이라 실측 ~10s).
export const maxDuration = 60;

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
// POST — upload (or replace) the page's photo (compressed + original)
// ─────────────────────────────────────────────────────────────────
// page_id UNIQUE 제약: 기존 행이 있으면 R2 객체 (압축본 + 원본 둘 다) +
// DB 행을 먼저 evict 한 뒤 INSERT. evict-then-insert 가 fragment_photos
// 와 동일한 패턴이라 정신 부담 적음.
//
// 원본 처리 (R0 — best-effort):
//   - fileOriginal 이 있으면 R2 에 별도 업로드 (병렬), DB 신컬럼에 저장
//   - 형식/크기/업로드 실패 시 원본만 NULL — 압축본은 정상 진행
//   - 폴백 정책의 핵심: "사용자 흐름이 절대 안 깨져야 함" (Tim)
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

  // 🔥 Sprint 2j (2026-05-11) — Trial quota check. Count user's existing
  //   photobook photos across all their photobooks; 403 if at limit.
  //   photobook_photos joins photobook_pages → user_books for ownership.
  const photoCountRes = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM photobook_photos pp
       JOIN photobook_pages  pg ON pg.id = pp.page_id
       JOIN user_books       ub ON ub.id = pg.book_id
      WHERE ub.user_id = $1`,
    [user.id]
  );
  const photoCount = photoCountRes.rows[0]?.n || 0;
  const photoCheck = await checkQuotaOrError(user.id, 'maxPhotos', photoCount);
  if (!photoCheck.ok) {
    return NextResponse.json(photoCheck.error, { status: 403 });
  }

  // Parse multipart.
  let form;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'invalid form data' }, { status: 400 }); }

  // ─── 압축본 (필수) ───
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }

  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) {
    return NextResponse.json(
      { error: 'Only image files are allowed (jpg, png, webp, heic).' },
      { status: 400 }
    );
  }
  if (typeof file.size === 'number' && file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Compressed file too large (max ${MAX_SIZE_BYTES / 1024 / 1024}MB).` },
      { status: 413 }
    );
  }

  // ─── 원본 (선택, best-effort) ───
  // 잘못된 형식/큰 파일은 무시하고 압축본만 진행 — 사용자 흐름 보존.
  const fileOriginal = form.get('fileOriginal');
  let hasOriginal = false;
  let originalMime = null;
  if (fileOriginal && typeof fileOriginal !== 'string') {
    originalMime = (fileOriginal.type || '').toLowerCase();
    if (!ALLOWED_MIME.includes(originalMime)) {
      console.warn(`[photobook photo POST] original MIME ${originalMime} not allowed, ignoring original`);
    } else if (typeof fileOriginal.size === 'number' && fileOriginal.size > MAX_ORIGINAL_SIZE_BYTES) {
      console.warn(`[photobook photo POST] original too large (${fileOriginal.size}), ignoring original`);
    } else {
      hasOriginal = true;
    }
  }

  // ─── 차원 정보 ───
  const widthRaw  = form.get('width');
  const heightRaw = form.get('height');
  const width  = Number.isFinite(Number(widthRaw))  && Number(widthRaw)  > 0 ? Number(widthRaw)  : null;
  const height = Number.isFinite(Number(heightRaw)) && Number(heightRaw) > 0 ? Number(heightRaw) : null;

  const originalWidthRaw  = form.get('originalWidth');
  const originalHeightRaw = form.get('originalHeight');
  const originalWidth  = Number.isFinite(Number(originalWidthRaw))  && Number(originalWidthRaw)  > 0 ? Number(originalWidthRaw)  : null;
  const originalHeight = Number.isFinite(Number(originalHeightRaw)) && Number(originalHeightRaw) > 0 ? Number(originalHeightRaw) : null;

  // ─── Evict existing row + R2 객체 (압축본 + 원본 둘 다) ───
  const existing = await db.query(
    `SELECT id, r2_key, r2_key_original FROM photobook_page_photos WHERE page_id = $1`,
    [pageId]
  );
  if (existing.rows.length > 0) {
    const oldRow = existing.rows[0];
    const oldKeys = [oldRow.r2_key, oldRow.r2_key_original].filter(Boolean);
    await Promise.all(oldKeys.map(async (k) => {
      try { await deletePhoto(k); }
      catch (e) { console.warn(`[photobook photo POST] R2 delete old failed (${k}):`, e?.message); }
    }));
    await db.query(`DELETE FROM photobook_page_photos WHERE id = $1`, [oldRow.id]);
  }

  // ─── R2 upload — 압축본 (필수) + 원본 (선택, best-effort) 병렬 ───
  let compressedR2 = null;   // { key, url }  — 무조건 채움 또는 throw
  let originalR2 = null;     // { key, url } | null
  try {
    const compressedBuffer = Buffer.from(await file.arrayBuffer());
    const compressedKey = makePhotoKey(user.id, pageId, extFromMime(mime));

    let originalBuffer = null;
    let originalKey = null;
    if (hasOriginal) {
      originalBuffer = Buffer.from(await fileOriginal.arrayBuffer());
      originalKey = makeOriginalPhotoKey(user.id, pageId, extFromMime(originalMime));
    }

    // 병렬 업로드 — 둘 다 같은 R2 bucket. 원본 업로드는 .catch() 로 흡수
    // 해서 null 로 떨어뜨림 — 압축본 promise 가 reject 되면 catch 절에서
    // 502 응답.
    const uploads = [
      uploadPhoto(compressedBuffer, compressedKey, mime),
    ];
    if (originalBuffer && originalKey) {
      uploads.push(
        uploadPhoto(originalBuffer, originalKey, originalMime)
          .catch((e) => {
            console.warn(`[photobook photo POST] original R2 upload failed:`, e?.message);
            return null; // 압축본은 OK, 원본만 포기
          })
      );
    }

    const results = await Promise.all(uploads);
    compressedR2 = results[0];
    originalR2 = results[1] || null;
  } catch (e) {
    console.error('[photobook photo POST] R2 upload (compressed) failed:', e?.message);
    return NextResponse.json({ error: 'storage upload failed' }, { status: 502 });
  }

  // ─── INSERT row ───
  try {
    const insert = await db.query(
      `INSERT INTO photobook_page_photos
         (page_id, r2_key, r2_url, width, height, size_bytes, mime_type,
          r2_key_original, r2_url_original, original_width, original_height,
          original_size_bytes, original_mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, page_id,
                 r2_key, r2_url, width, height, size_bytes, mime_type,
                 r2_key_original, r2_url_original,
                 original_width, original_height,
                 original_size_bytes, original_mime_type,
                 created_at`,
      [
        pageId,
        compressedR2.key,
        compressedR2.url,
        width,
        height,
        typeof file.size === 'number' ? file.size : null,
        mime,
        originalR2?.key || null,
        originalR2?.url || null,
        originalWidth,
        originalHeight,
        originalR2 && typeof fileOriginal.size === 'number' ? fileOriginal.size : null,
        originalR2 ? originalMime : null,
      ]
    );
    const photo = insert.rows[0];

    // Bump book last_active_at so list ordering reflects activity.
    await db.query(
      `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
      [photobookId]
    );

    console.log(
      `[photobook photo POST] page=${pageId} ` +
      `compressed=${compressedR2.key} (${file.size}b ${mime}) ` +
      `original=${originalR2?.key || 'NONE'} (${originalR2 ? fileOriginal.size : 0}b)`
    );
    return NextResponse.json({ photo }, { status: 201 });
  } catch (e) {
    console.error('[photobook photo POST] db insert failed:', e?.message);
    // R2 객체 둘 다 정리 — DB 가 실패했으니 storage 에 남기면 안 됨.
    try { await deletePhoto(compressedR2.key); } catch {}
    if (originalR2) { try { await deletePhoto(originalR2.key); } catch {} }
    return NextResponse.json({ error: 'db insert failed' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE — remove the page's photo (R2 + DB, both compressed + original)
// ─────────────────────────────────────────────────────────────────
// page_id UNIQUE 라 한 행만 있음. 두 R2 객체 모두 best-effort 정리, DB
// 삭제 우선. legacy 사진은 r2_key_original = NULL 이라 자동으로 SKIP.
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

  // Fetch row for R2 keys (둘 다).
  const existing = await db.query(
    `SELECT id, r2_key, r2_key_original FROM photobook_page_photos WHERE page_id = $1`,
    [pageId]
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: 'photo not found' }, { status: 404 });
  }

  const row = existing.rows[0];

  // DB delete first (cascade-safe).
  await db.query(`DELETE FROM photobook_page_photos WHERE id = $1`, [row.id]);

  // R2 best-effort — 두 키 모두 (legacy 는 r2_key_original 이 NULL).
  const keysToDelete = [row.r2_key, row.r2_key_original].filter(Boolean);
  await Promise.all(keysToDelete.map(async (k) => {
    try { await deletePhoto(k); }
    catch (e) { console.warn(`[photobook photo DELETE] R2 cleanup failed (${k}):`, e?.message); }
  }));

  // Bump book last_active_at.
  await db.query(
    `UPDATE user_books SET last_active_at = NOW() WHERE id = $1`,
    [photobookId]
  );

  console.log(`[photobook photo DELETE] page=${pageId} keys=[${keysToDelete.join(', ')}]`);
  return NextResponse.json({ ok: true });
}
