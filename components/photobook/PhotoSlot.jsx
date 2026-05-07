'use client';

/**
 * PhotoSlot — single-photo slot for a photobook page.
 *
 * Empty state: 3-way picker (camera / gallery / file). Each option uses
 * a hidden <input type="file"> with the right accept/capture attributes
 * so the OS opens the right native sheet — explicit beats one-button
 * iOS sheets that hide the camera unless the user knows to long-press.
 *
 * Filled state: photo preview + change/delete menu.
 *
 * Compression follows the fragment PhotoUploader pattern: client-side
 * canvas resize to ≤1920px longest edge + JPEG 80% to keep R2 costs
 * reasonable and HEIC-friendly (browser decode + JPEG re-encode).
 *
 * Props:
 *   photobookId  : UUID
 *   pageId       : UUID
 *   photo        : current photo row (or null)
 *   lang         : 'KO' | 'EN' | 'ES'
 *   onChange(p)  : called with the new photo row (or null on delete)
 */

import { useRef, useState } from 'react';
import { pbMsgs } from './photobookI18n';
import { uploadPagePhoto, deletePagePhoto } from './photobookFetch';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_RAW_SIZE = 10 * 1024 * 1024;
const TARGET_MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.80;

// 🔥 R0 (2026-05-06) — original (print-quality) preset.
// 4K (4096px longest edge) is the practical print ceiling for A5/A4
// photobooks at 300 DPI. Larger phones (12MP+) get downsampled to 4K
// to bound R2 storage; smaller-than-4K originals keep their native
// resolution (no upscale).
const ORIGINAL_MAX_DIMENSION = 4096;
const ORIGINAL_JPEG_QUALITY = 0.95;

function looksLikeHeic(file) {
  const t = (file.type || '').toLowerCase();
  const ext = (file.name || '').toLowerCase().split('.').pop();
  return t.includes('heic') || t.includes('heif') || ext === 'heic' || ext === 'heif';
}

/**
 * Browser-side resize + recompress to JPEG.
 *
 * Used for the DISPLAY copy (1920px JPEG 80%) — small enough to render
 * fast in the editor, big enough to look sharp on retina.
 */
async function compressImage(file) {
  return _processImage(file, {
    maxDim: TARGET_MAX_DIMENSION,
    quality: JPEG_QUALITY,
    suffix: '',
  });
}

/**
 * 🔥 R0 (2026-05-06) — Prepare a high-res JPEG copy for the print PDF.
 *
 * Differs from compressImage() in three ways:
 *   1. Longest edge ≤ 4096px (vs 1920px) — print-quality at 300 DPI for
 *      A4/A5 size, but still bounded so a 48MP phone shot doesn't
 *      balloon R2 storage.
 *   2. JPEG quality 95% (vs 80%) — print needs minimal compression.
 *   3. HEIC → JPEG via canvas (browsers decode HEIC, then we encode
 *      JPEG) so the printed file is a format every print service
 *      accepts.
 *
 * EXIF rotation: drawImage() applies the metadata orientation to the
 * canvas pixels. The output JPEG carries no orientation tag, so PDF
 * libraries that don't read EXIF (most of them) still render upright.
 *
 * Smaller-than-4K originals keep their native resolution — never
 * upscale.
 */
async function prepareOriginalImage(file) {
  return _processImage(file, {
    maxDim: ORIGINAL_MAX_DIMENSION,
    quality: ORIGINAL_JPEG_QUALITY,
    suffix: '_orig',
  });
}

/**
 * Shared canvas resize + JPEG re-encode pipeline used by both
 * compressImage() and prepareOriginalImage(). Pulled out so the two
 * paths can't drift on dimension/EXIF/blob handling.
 */
function _processImage(file, { maxDim, quality, suffix }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);
      // Only downsample if larger than the cap — never upscale.
      if (longest > maxDim) {
        const scale = maxDim / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error(`canvas blob (${suffix || 'compressed'}) failed`));
          const out = new File(
            [blob],
            (file.name || 'photo').replace(/\.[^.]+$/, '') + suffix + '.jpg',
            { type: 'image/jpeg' }
          );
          resolve({ file: out, width, height });
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error(`image load failed (${suffix || 'compressed'})`));
    reader.onerror = () => reject(new Error(`file read failed (${suffix || 'compressed'})`));
    reader.readAsDataURL(file);
  });
}

export default function PhotoSlot({
  photobookId,
  pageId,
  photo,
  lang = 'KO',
  onChange,
}) {
  const m = pbMsgs(lang);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const fileRef = useRef(null);

  async function handleFile(file) {
    setError('');
    if (!file) return;
    const t = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.includes(t) && !looksLikeHeic(file)) {
      setError(m.photoInvalidType);
      return;
    }
    if (file.size > MAX_RAW_SIZE) {
      setError(m.photoTooLarge);
      return;
    }

    setUploading(true);
    try {
      // 🔥 R0 — 압축본 (display) + 원본 (print) 병렬 생성.
      //   원본 변환이 실패해도 압축본만으로 진행 (best-effort) — 서버
      //   라우트도 fileOriginal 누락을 정상 케이스로 처리한다.
      const [compressed, original] = await Promise.all([
        compressImage(file),
        prepareOriginalImage(file).catch((e) => {
          console.warn('[PhotoSlot] original prep failed, falling back to compressed-only:', e?.message);
          return null;
        }),
      ]);

      const uploaded = await uploadPagePhoto(
        photobookId, pageId, compressed.file,
        {
          width: compressed.width,
          height: compressed.height,
          original:       original?.file   || null,
          originalWidth:  original?.width  || null,
          originalHeight: original?.height || null,
        }
      );
      onChange?.(uploaded);
    } catch (e) {
      console.error('[PhotoSlot] upload failed:', e?.message);
      setError(e?.message || m.photoUploadFailed);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!photo) return;
    if (!window.confirm(m.photoDeleteConfirm)) return;
    setMenuOpen(false);
    try {
      await deletePagePhoto(photobookId, pageId);
      onChange?.(null);
    } catch (e) {
      console.error('[PhotoSlot] delete failed:', e?.message);
      setError(e?.message || m.error);
    }
  }

  // Hidden inputs — declared once, triggered by the visible buttons.
  const inputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </>
  );

  if (uploading) {
    return (
      <div className="slot uploading">
        <div className="spinner" />
        <div className="upHint">{m.photoUploading}</div>
        {inputs}
        <style jsx>{slotStyles}</style>
      </div>
    );
  }

  if (photo) {
    // 🔥 2026-05-06 (Tim) — src goes through /api/photobook-photo/[id]
    // proxy. Loading R2's pub-*.r2.dev URL directly is blocked by
    // Chrome's SafeBrowsing dev-URL filter (same issue as audio in
    // FragmentModal). Proxying through our own domain bypasses it.
    return (
      <div className="slot filled">
        <img src={`/api/photobook-photo/${photo.id}`} alt="" />

        <button
          type="button"
          className="moreBtn"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
          aria-label={m.moreActions}
        >
          ⋮
        </button>

        {menuOpen && (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="menuItem"
              onClick={() => { setMenuOpen(false); galleryRef.current?.click(); }}
            >
              {m.photoChange}
            </button>
            <button
              type="button"
              className="menuItem danger"
              onClick={handleDelete}
            >
              {m.photoDelete}
            </button>
          </div>
        )}

        {error && <div className="err">{error}</div>}
        {inputs}
        <style jsx>{slotStyles}</style>
      </div>
    );
  }

  return (
    <div className="slot empty">
      <div className="emptyHint">{m.photoEmptyHint}</div>
      <div className="pickRow">
        <button type="button" className="pickBtn" onClick={() => cameraRef.current?.click()}>
          <span className="pickIcon">📷</span>
          <span className="pickLabel">{m.photoCamera}</span>
        </button>
        <button type="button" className="pickBtn" onClick={() => galleryRef.current?.click()}>
          <span className="pickIcon">🖼</span>
          <span className="pickLabel">{m.photoGallery}</span>
        </button>
        <button type="button" className="pickBtn" onClick={() => fileRef.current?.click()}>
          <span className="pickIcon">📁</span>
          <span className="pickLabel">{m.photoFile}</span>
        </button>
      </div>
      {error && <div className="err">{error}</div>}
      {inputs}
      <style jsx>{slotStyles}</style>
    </div>
  );
}

const slotStyles = `
  .slot {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    overflow: hidden;
  }
  .slot.empty {
    aspect-ratio: auto;
    border: 2px dashed rgba(251, 146, 60, 0.45);
    background: rgba(251, 146, 60, 0.06);
    padding: 22px 14px 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }
  .slot.uploading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1.5px dashed rgba(255, 255, 255, 0.18);
  }
  .slot.filled {
    background: #000;
  }
  .slot.filled img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    display: block;
  }
  .emptyHint {
    color: rgba(255, 255, 255, 0.85);
    font-size: 16px;
    font-weight: 600;
    margin-top: 6px;
  }
  .pickRow {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    width: 100%;
  }
  .pickBtn {
    min-height: 88px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 12px;
    color: #fdf8f4;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 4px;
    transition: background 0.15s, transform 0.1s;
  }
  .pickBtn:hover  { background: rgba(255, 255, 255, 0.14); }
  .pickBtn:active { transform: scale(0.97); }
  .pickIcon { font-size: 28px; line-height: 1; }
  .pickLabel { font-size: 12.5px; line-height: 1.25; text-align: center; }
  .moreBtn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 36px; height: 36px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .moreBtn:hover { background: rgba(0, 0, 0, 0.7); }
  .menu {
    position: absolute;
    top: 50px;
    right: 8px;
    background: #1a1410;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    z-index: 5;
    min-width: 130px;
  }
  .menuItem {
    display: block;
    width: 100%;
    padding: 12px 14px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.92);
    font-size: 14px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .menuItem:hover { background: rgba(255, 255, 255, 0.08); }
  .menuItem.danger { color: #fca5a5; }
  .menuItem.danger:hover { background: rgba(239, 68, 68, 0.12); }
  .spinner {
    width: 28px; height: 28px;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: #fb923c;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .upHint {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
  }
  .err {
    position: absolute;
    left: 10px; right: 10px; bottom: 10px;
    background: rgba(239, 68, 68, 0.14);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12.5px;
    line-height: 1.35;
  }
  /* In the empty state the .err sits in the flow, not absolute */
  .slot.empty .err {
    position: static;
    width: 100%;
  }
  @media (min-width: 560px) {
    .pickBtn { min-height: 96px; }
  }
`;
