'use client';

/**
 * /photobook/new — single-screen create flow.
 *
 * On submit:
 *   POST /api/photobooks { title, subtitle? }
 *   → router.replace(`/photobook/${id}/edit`)
 *
 * Strategy: STRATEGY-photobook-expansion-v3-2026-05-06.md §4 F2.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPhotobook, getToken } from '@/components/photobook/photobookFetch';
import { pbMsgs } from '@/components/photobook/photobookI18n';
import s from './page.module.css';

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

export default function PhotobookNewPage() {
  const router = useRouter();
  const lang = useLang();
  const m = pbMsgs(lang);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auth gate.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!getToken()) {
      try { sessionStorage.setItem('postLoginRedirect', '/photobook/new'); } catch {}
      router.replace('/login');
    }
  }, [router]);

  async function handleSubmit(e) {
    e?.preventDefault?.();
    const t = title.trim();
    if (!t) {
      setError(m.titleRequired);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const book = await createPhotobook({ title: t, subtitle: subtitle.trim() });
      router.replace(`/photobook/${book.id}/edit`);
    } catch (e2) {
      console.error('[/photobook/new] create failed:', e2?.message);
      setError(e2?.message || m.createFailed);
      setSubmitting(false);
    }
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button
          type="button"
          className={s.backBtn}
          onClick={() => router.push('/photobook')}
          aria-label={m.backBtn}
        >‹</button>
        <span className={s.pageTitle}>{m.pageTitleNew}</span>
      </header>

      <form className={s.body} onSubmit={handleSubmit} noValidate>
        <h1 className={s.h1}>{m.pageTitleNew}</h1>

        <div className={s.field}>
          <label className={s.label} htmlFor="pb-title">{m.titleLabel}</label>
          <input
            id="pb-title"
            className={s.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={m.titlePlaceholder}
            autoFocus
            maxLength={200}
            inputMode="text"
            autoComplete="off"
          />
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor="pb-subtitle">{m.subtitleLabel}</label>
          <input
            id="pb-subtitle"
            className={s.input}
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder={m.subtitlePlace}
            maxLength={2000}
            inputMode="text"
            autoComplete="off"
          />
        </div>

        {error && <div className={s.errorBox}>{error}</div>}

        <button
          type="submit"
          className={s.cta}
          disabled={submitting || !title.trim()}
        >
          {submitting ? m.creating : m.createBtn}
        </button>
      </form>
    </div>
  );
}
