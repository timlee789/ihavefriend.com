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
