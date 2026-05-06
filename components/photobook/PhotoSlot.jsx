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

function looksLikeHeic(file) {
  const t = (file.type || '').toLowerCase();
  const ext = (file.name || '').toLowerCase().split('.').pop();
  return t.includes('heic') || t.includes('heif') || ext === 'heic' || ext === 'heif';
}

/** Browser-side resize + recompress to JPEG. */
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);
      if (longest > TARGET_MAX_DIMENSION) {
        const scale = TARGET_MAX_DIMENSION / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('canvas blob failed'));
          const compressed = new File(
            [blob],
            (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg',
            { type: 'image/jpeg' }
          );
          resolve({ file: compressed, width, height });
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };
    img.onerror = () => reject(new Error('image load failed'));
    reader.onerror = () => reject(new Error('file read failed'));
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
      const { file: compressed, width, height } = await compressImage(file);
      const uploaded = await uploadPagePhoto(
        photobookId, pageId, compressed, { width, height }
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
    return (
      <div className="slot filled">
        <img src={photo.r2_url} alt="" />

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
