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

  useEffect(() => {
    const userLang = getUserLang();
    setLang(userLang);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    Promise.all([
      fetch(`/api/book/templates?lang=${encodeURIComponent(userLang)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
      fetch('/api/book/list', {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
    ])
      .then(([tpl, list]) => {
        setTemplates(tpl.templates || []);
        setActiveBooks((list.books || []).filter(b => b.status === 'in_progress'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const m = BOOK_MSGS[lang] || BOOK_MSGS.ko;

  const findActive = (templateId) =>
    activeBooks.find(b => b.template_id === templateId);

  async function startBook(templateId) {
    // 🔥 Task 71 — client guard against accidental double-start.
    //   The DB also enforces this via a partial unique index added
    //   by scripts/apply-book-dedup-index.js.
    const existing = findActive(templateId);
    if (existing) {
      router.push(`/book/${existing.id}`);
      return;
    }
    setStarting(templateId);
    const token = localStorage.getItem('token');
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
          const active = findActive(t.id);
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
              onClick={() => startBook(t.id)}
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
