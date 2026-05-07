/**
 * Tiny photobook-scoped fetch helpers. Wraps the project's existing
 * authFetch (token from localStorage → Authorization header) and
 * specialises a couple of multipart upload paths so component code
 * stays thin.
 *
 * Why a separate file: the photobook flow uses multipart uploads for
 * photos and audio that don't fit authFetch's JSON-default Content-Type.
 * Centralising them here avoids forgetting to drop the json header.
 */
'use client';

import { getToken, authFetch } from '@/components/fragments/fragmentHelpers';

export { getToken, authFetch };

/**
 * Multipart fetch — no Content-Type header (browser sets boundary).
 * For POST /photo and /audio uploads. Adds Authorization if a token
 * is in localStorage.
 */
export function authFetchMultipart(url, formData, opts = {}) {
  const token = getToken();
  return fetch(url, {
    method: 'POST',
    body: formData,
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** GET /api/photobooks → list of summaries. */
export async function fetchPhotobookList() {
  const res = await authFetch('/api/photobooks');
  if (!res.ok) throw new Error(`list failed (${res.status})`);
  const data = await res.json();
  return data.photobooks || [];
}

/** POST /api/photobooks → new book. */
export async function createPhotobook({ title, subtitle }) {
  const res = await authFetch('/api/photobooks', {
    method: 'POST',
    body: JSON.stringify({ title, subtitle: subtitle || '' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `create failed (${res.status})`);
  return data.photobook;
}

/** GET /api/photobooks/[id] → { photobook, pages }. */
export async function fetchPhotobookFull(photobookId) {
  const res = await authFetch(`/api/photobooks/${photobookId}`);
  if (!res.ok) throw new Error(`load failed (${res.status})`);
  return res.json();
}

/** PATCH /api/photobooks/[id] (title/subtitle). */
export async function patchPhotobook(photobookId, body) {
  const res = await authFetch(`/api/photobooks/${photobookId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patch failed (${res.status})`);
  return res.json();
}

/** POST /api/photobooks/[id]/pages → new page (auto-numbered). */
export async function addPage(photobookId, body = {}) {
  const res = await authFetch(`/api/photobooks/${photobookId}/pages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `add page failed (${res.status})`);
  return data.page;
}

/** PATCH /api/photobooks/[id]/pages/[pageId] (title/caption/caption_raw). */
export async function patchPage(photobookId, pageId, body) {
  const res = await authFetch(
    `/api/photobooks/${photobookId}/pages/${pageId}`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`page patch failed (${res.status})`);
  return res.json();
}

/** DELETE /api/photobooks/[id]/pages/[pageId]. */
export async function deletePage(photobookId, pageId) {
  const res = await authFetch(
    `/api/photobooks/${photobookId}/pages/${pageId}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`page delete failed (${res.status})`);
  return res.json();
}

/** POST /api/photobooks/[id]/pages/reorder { pageIds: [pageId, …] }. */
export async function reorderPages(photobookId, orderedIds) {
  const res = await authFetch(
    `/api/photobooks/${photobookId}/pages/reorder`,
    { method: 'POST', body: JSON.stringify({ pageIds: orderedIds }) }
  );
  if (!res.ok) throw new Error(`reorder failed (${res.status})`);
  return res.json();
}

/**
 * POST /api/photobooks/[id]/pages/[pageId]/photo (multipart).
 *
 * 🔥 R0 (2026-05-06) — 압축본 + 원본 둘 다 보냄. dims.original 이 있으면
 * fileOriginal 필드로 함께 multipart 에 추가. 서버는 best-effort 처리.
 *
 * @param {Object} dims    Optional dimensions + original blob.
 * @param {number} dims.width
 * @param {number} dims.height
 * @param {Blob}   dims.original         원본 JPEG (4096px, EXIF 회전 적용됨)
 * @param {number} dims.originalWidth
 * @param {number} dims.originalHeight
 */
export async function uploadPagePhoto(photobookId, pageId, file, dims = {}) {
  const fd = new FormData();
  fd.append('file', file, file.name || 'photo.jpg');
  if (dims.width)  fd.append('width',  String(dims.width));
  if (dims.height) fd.append('height', String(dims.height));

  // 🔥 R0 — 원본도 함께 (있으면). 없으면 서버에서 압축본만 처리.
  if (dims.original) {
    fd.append('fileOriginal', dims.original, dims.original.name || 'photo_orig.jpg');
    if (dims.originalWidth)  fd.append('originalWidth',  String(dims.originalWidth));
    if (dims.originalHeight) fd.append('originalHeight', String(dims.originalHeight));
  }

  const res = await authFetchMultipart(
    `/api/photobooks/${photobookId}/pages/${pageId}/photo`,
    fd
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `photo upload failed (${res.status})`);
  return data.photo;
}

/** DELETE photo for a page. */
export async function deletePagePhoto(photobookId, pageId) {
  const res = await authFetch(
    `/api/photobooks/${photobookId}/pages/${pageId}/photo`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`photo delete failed (${res.status})`);
  return res.json();
}

/** POST audio (multipart). Returns the inserted audio row. */
export async function uploadPageAudio(photobookId, pageId, blob, durationSec, whisperText) {
  const fd = new FormData();
  fd.append('audio', blob, 'audio.webm');
  fd.append('duration', String(Math.round(durationSec)));
  if (whisperText) fd.append('whisperText', whisperText);
  const res = await authFetchMultipart(
    `/api/photobooks/${photobookId}/pages/${pageId}/audio`,
    fd
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `audio upload failed (${res.status})`);
  return data.audio;
}

/** PATCH audio is_public. */
export async function patchAudioVisibility(photobookId, pageId, isPublic) {
  const res = await authFetch(
    `/api/photobooks/${photobookId}/pages/${pageId}/audio`,
    { method: 'PATCH', body: JSON.stringify({ is_public: !!isPublic }) }
  );
  if (!res.ok) throw new Error(`audio patch failed (${res.status})`);
  const data = await res.json();
  return data.audio;
}

/** DELETE page audio. */
export async function deletePageAudio(photobookId, pageId) {
  const res = await authFetch(
    `/api/photobooks/${photobookId}/pages/${pageId}/audio`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`audio delete failed (${res.status})`);
  return res.json();
}

/**
 * POST /api/transcribe with the recorded blob. Returns the transcript
 * string (empty string if Whisper didn't return text). Failures throw.
 */
export async function transcribeAudio(blob, lang = 'ko') {
  const fd = new FormData();
  fd.append('audio', blob, 'recording.webm');
  fd.append('lang', String(lang || 'ko').toLowerCase());
  const res = await authFetchMultipart('/api/transcribe', fd);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `transcribe failed (${res.status})`);
  return (data.transcript || '').trim();
}
