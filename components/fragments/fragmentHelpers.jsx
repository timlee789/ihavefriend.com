/**
 * components/fragments/fragmentHelpers.js  (Task 82)
 *
 * Tiny helper surface shared by FragmentModal +
 * FragmentCollectionPicker. Extracted from /my-stories/page.jsx
 * so the same modal can run on the book question surface without
 * a copy-paste round-trip.
 */
'use client';

import s from '@/app/my-stories/page.module.css';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function authFetch(url, opts = {}) {
  const token = getToken();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export function fmtDate(d, lang = 'KO') {
  if (!d) return '';
  const dt = new Date(d);
  const locale = lang === 'EN' ? 'en-US' : lang === 'ES' ? 'es-ES' : 'ko-KR';
  return dt.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function fmtDateShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

export function preview(text, max = 100) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export function Spinner() {
  return (
    <div className={s.spinner}>
      <div className={s.spinnerDot} />
      <div className={s.spinnerDot} />
      <div className={s.spinnerDot} />
    </div>
  );
}

/**
 * Beta Step 2/2b (2026-05-21) — 이야기책 PDF 호출 헬퍼.
 *   /my-stories/customize 와 /my-stories 둘 다에서 사용.
 *   preview: 새 탭, generate: 다운로드. busy/error 콜백 처리.
 *
 *   url:         '/api/collections-book/preview' 또는 '/generate'
 *   asDownload:  true 면 다운로드, false 면 새 탭
 *   downloadName: 파일명 (asDownload=true 때)
 *   setBusy(bool): 진행중 상태 콜백
 *   setErr(str):  에러 메시지 콜백
 *   errMsg:       기본 에러 메시지 (서버 응답에 message 없을 때)
 */
export async function pdfPostAndOpen({ url, asDownload, downloadName, setBusy, setErr, errMsg }) {
  setBusy(true);
  setErr('');
  try {
    const res = await authFetch(url, { method: 'POST' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.message || j.error || errMsg);
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (asDownload) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = downloadName || 'storybook.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      window.open(blobUrl, '_blank');
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  } catch (e) {
    setErr(e?.message || errMsg);
  } finally {
    setBusy(false);
  }
}
