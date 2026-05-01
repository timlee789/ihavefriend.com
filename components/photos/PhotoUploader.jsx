'use client';

/**
 * PhotoUploader — fragment에 사진 최대 2장 업로드 (Task 75).
 *
 * 흐름: <input type=file> → canvas 압축 (1920px / JPEG 80%) →
 *   @vercel/blob/client.upload() → 우리 API의 handleUpload signed-token
 *   → 직접 Blob에 PUT → onUploadCompleted에서 DB row INSERT.
 *
 * Props:
 *   fragmentId  : UUID
 *   lang        : 'ko' | 'en' | 'es' (lowercase)
 *   onChange    : (photos[]) => void   (parent refresh trigger)
 */

import { useState, useEffect, useCallback } from 'react';
import { upload } from '@vercel/blob/client';

const MSGS = {
  ko: {
    addPhoto      : '📷 사진 추가',
    uploading     : '업로드 중…',
    deleteConfirm : '이 사진을 삭제할까요?',
    fileTooLarge  : '파일이 너무 커요 (최대 8MB)',
    invalidType   : '이미지 파일만 가능해요 (jpg, png, webp, heic)',
    uploadFailed  : '업로드 실패. 다시 시도해주세요.',
    photo1        : '사진 1',
    photo2        : '사진 2',
  },
  en: {
    addPhoto      : '📷 Add photo',
    uploading     : 'Uploading…',
    deleteConfirm : 'Delete this photo?',
    fileTooLarge  : 'File too large (max 8MB)',
    invalidType   : 'Image files only (jpg, png, webp, heic)',
    uploadFailed  : 'Upload failed. Please try again.',
    photo1        : 'Photo 1',
    photo2        : 'Photo 2',
  },
  es: {
    addPhoto      : '📷 Añadir foto',
    uploading     : 'Subiendo…',
    deleteConfirm : '¿Eliminar esta foto?',
    fileTooLarge  : 'Archivo demasiado grande (máx 8MB)',
    invalidType   : 'Solo imágenes (jpg, png, webp, heic)',
    uploadFailed  : 'Error al subir. Inténtalo de nuevo.',
    photo1        : 'Foto 1',
    photo2        : 'Foto 2',
  },
};

const ALLOWED_TYPES        = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_RAW_SIZE         = 8 * 1024 * 1024;   // 8MB raw
const TARGET_MAX_DIMENSION = 1920;
const JPEG_QUALITY         = 0.80;

/** Browser-side resize + recompress to JPEG. iOS HEIC also works because
 *  we're letting the browser decode and re-encode. */
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
        width  = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('canvas blob failed'));
          const compressed = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, '.jpg'),
            { type: 'image/jpeg' }
          );
          resolve({ file: compressed, width, height });
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };
    img.onerror   = () => reject(new Error('image load failed'));
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

export default function PhotoUploader({ fragmentId, lang = 'ko', onChange }) {
  const m = MSGS[lang] || MSGS.ko;
  const [photos, setPhotos]     = useState([]);
  const [uploading, setUploading] = useState(null); // displayOrder being uploaded
  const [error, setError]       = useState('');

  const loadPhotos = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/fragments/${fragmentId}/photos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const arr = data.photos || [];
        setPhotos(arr);
        onChange && onChange(arr);
      }
    } catch {}
  }, [fragmentId, onChange]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  async function pickAndUpload(displayOrder) {
    setError('');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
    input.capture = 'environment'; // mobile camera hint; desktop ignores

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Type belt-and-suspenders: the picker already filters, but we double-check.
      const t = (file.type || '').toLowerCase();
      const ext = file.name.toLowerCase().split('.').pop();
      const looksHeic = t.includes('heic') || t.includes('heif') || ext === 'heic' || ext === 'heif';
      if (!ALLOWED_TYPES.includes(t) && !looksHeic) {
        setError(m.invalidType);
        return;
      }
      if (file.size > MAX_RAW_SIZE) {
        setError(m.fileTooLarge);
        return;
      }

      setUploading(displayOrder);
      try {
        const { file: compressed } = await compressImage(file);
        await upload(compressed.name, compressed, {
          access: 'public',
          handleUploadUrl: `/api/fragments/${fragmentId}/photos/upload-url`,
          clientPayload: JSON.stringify({
            contentType: compressed.type,
            sizeBytes  : compressed.size,
            displayOrder,
          }),
        });
        await loadPhotos();
      } catch (err) {
        console.error('[PhotoUploader] upload failed:', err);
        setError(err?.message || m.uploadFailed);
      } finally {
        setUploading(null);
      }
    };
    input.click();
  }

  async function deletePhoto(photoId) {
    if (!confirm(m.deleteConfirm)) return;
    const token = localStorage.getItem('token');
    await fetch(`/api/fragments/${fragmentId}/photos/${photoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadPhotos();
  }

  const slot1 = photos.find(p => p.display_order === 1);
  const slot2 = photos.find(p => p.display_order === 2);

  return (
    <div className="photoUploader">
      <div className="photoSlots">
        <PhotoSlot
          photo={slot1} label={m.photo1}
          uploading={uploading === 1}
          onAdd={() => pickAndUpload(1)}
          onDelete={() => slot1 && deletePhoto(slot1.id)}
          uploadingLabel={m.uploading} addLabel={m.addPhoto}
        />
        <PhotoSlot
          photo={slot2} label={m.photo2}
          uploading={uploading === 2}
          onAdd={() => pickAndUpload(2)}
          onDelete={() => slot2 && deletePhoto(slot2.id)}
          uploadingLabel={m.uploading} addLabel={m.addPhoto}
        />
      </div>
      {error && <div className="photoError">{error}</div>}

      <style jsx>{`
        .photoUploader { margin-top: 12px; }
        .photoSlots { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .photoError {
          margin-top: 8px;
          padding: 8px 12px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-radius: 8px;
          color: #fca5a5;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}

function PhotoSlot({ photo, label, uploading, onAdd, onDelete, uploadingLabel, addLabel }) {
  if (uploading) {
    return (
      <div className="slot slotEmpty">
        <span className="loading">{uploadingLabel}</span>
        <style jsx>{`
          .slot { aspect-ratio: 4/3; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
          .slotEmpty { background: #2a2520; border: 1px dashed rgba(255,255,255,0.2); }
          .loading { color: rgba(255,255,255,0.6); font-size: 13px; }
        `}</style>
      </div>
    );
  }
  if (photo) {
    return (
      <div className="slot slotFilled">
        <img src={photo.blob_url} alt={label} />
        <button className="deleteBtn" onClick={onDelete} aria-label="delete">🗑️</button>
        <style jsx>{`
          .slot { position: relative; aspect-ratio: 4/3; border-radius: 10px; overflow: hidden; }
          .slotFilled { background: #000; }
          img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .deleteBtn {
            position: absolute; top: 6px; right: 6px;
            width: 30px; height: 30px;
            border-radius: 50%;
            background: rgba(0,0,0,0.6); color: white;
            border: none; cursor: pointer;
            font-size: 14px;
          }
        `}</style>
      </div>
    );
  }
  return (
    <button className="slot slotEmpty" onClick={onAdd} type="button">
      <span className="addIcon">📷</span>
      <span className="addLabel">{addLabel}</span>
      <style jsx>{`
        .slot {
          aspect-ratio: 4/3; border-radius: 10px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 6px; cursor: pointer; font-family: inherit;
        }
        .slotEmpty {
          background: #2a2520; border: 1px dashed rgba(255,255,255,0.2);
          color: rgba(255,255,255,0.7);
        }
        .slotEmpty:hover {
          border-color: rgba(234, 88, 12, 0.5);
          background: rgba(234, 88, 12, 0.05);
        }
        .addIcon { font-size: 24px; }
        .addLabel { font-size: 12px; }
      `}</style>
    </button>
  );
}
