'use client';

/**
 * /book/templates — pick a template to start a new book.
 *
 * 🔥 Task 71: replaces /book/select. The old page mixed "books in
 * progress" with "templates"; the home Resume CTA already covers
 * the in-progress case, so this surface is templates-only. Templates
 * the senior already has a live book on are shown as disabled with
 * an "In progress" badge — clicking them jumps to that existing
 * book instead of accidentally creating a duplicate.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUserLang, titleOf } from '@/lib/i18nHelper';
import { BOOK_MSGS } from '@/lib/bookI18n';
import s from './page.module.css';

export default function BookTemplatesPage() {
  const router = useRouter();
  const [lang, setLang] = useState('ko');
  const [templates, setTemplates] = useState([]);
  const [activeBooks, setActiveBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);

  // 🔥 Task 74 — public browsing. Visitors can see the cards; the
  //   "start" tap is what triggers the login prompt. We always fetch
  //   /api/book/templates (now public). /api/book/list is only
  //   fetched when a token is present, so logged-out users skip it.
  useEffect(() => {
    const userLang = getUserLang();
    setLang(userLang);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const listFetch = token
      ? fetch('/api/book/list', { headers }).then(r => r.json())
      : Promise.resolve({ books: [] });
    Promise.all([
      fetch(`/api/book/templates?lang=${encodeURIComponent(userLang)}`, { headers }).then(r => r.json()),
      listFetch,
    ])
      .then(([tpl, list]) => {
        setTemplates(tpl.templates || []);
        setActiveBooks((list.books || []).filter(b => b.status === 'in_progress'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const m = BOOK_MSGS[lang] || BOOK_MSGS.ko;

  // 🔥 Task 73 — match by category, not template_id. Memoir-ko and
  //   memoir-en share category='memoir'; if the senior already has
  //   one in flight (in any language), all three memoir cards render
  //   with the "In progress" badge and tap through to that book.
  const findActiveForCategory = (category) =>
    activeBooks.find(b => b.template_category === category);

  async function startBook(template) {
    // 🔥 Task 74 — visitors get bounced to /login here (the page
    //   itself is public so they can browse).
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      try { sessionStorage.setItem('postLoginRedirect', '/book/templates'); } catch {}
      router.push('/login');
      return;
    }
    // Client guard — server backstops with the partial unique index.
    const existing = findActiveForCategory(template.category);
    if (existing) {
      router.push(`/book/${existing.id}`);
      return;
    }
    const templateId = template.id;
    setStarting(templateId);
    try {
      const res = await fetch('/api/book/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json().catch(() => ({}));
      // The server's resume path returns { bookId, resumed: true } on
      // 200, and the dedup conflict path returns 409 with bookId.
      if (data.bookId) {
        router.push(`/book/${data.bookId}`);
        return;
      }
    } catch {}
    setStarting(null);
  }

  if (loading) return <div className={s.loading}>{m.loading}</div>;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push('/')}>
          ← {m.home}
        </button>
        <h1 className={s.title}>📚 {m.bookTemplatesTitle}</h1>
      </header>

      <p className={s.intro}>{m.bookTemplatesIntro}</p>

      <div className={s.templateList}>
        {templates.map(t => {
          const active = findActiveForCategory(t.category);
          const inProgress = !!active;
          const icon =
            t.category === 'memoir' ? '📖' :
            t.category === 'essays' ? '✒️' :
            t.category === 'family' ? '👨‍👩‍👧' :
            t.category === 'short'  ? '✨' : '📚';
          return (
            <button
              key={t.id}
              className={`${s.templateCard} ${inProgress ? s.templateInProgress : ''}`}
              onClick={() => startBook(t)}
              disabled={starting === t.id}
            >
              <div className={s.templateIcon}>{icon}</div>
              <div className={s.templateInfo}>
                <div className={s.templateTitle}>
                  {titleOf(t.name, lang) || t.id}
                  {inProgress && (
                    <span className={s.inProgressBadge}>{m.alreadyInProgress}</span>
                  )}
                </div>
                {titleOf(t.description, lang) && (
                  <div className={s.templateDesc}>{titleOf(t.description, lang)}</div>
                )}
                <div className={s.templateMeta}>
                  {t.estimated_chapters} {m.chapters} · {t.estimated_questions} {m.questions} · ~{t.estimated_pages} {m.pages}
                </div>
              </div>
              {starting === t.id && <div className={s.spinner}>…</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
