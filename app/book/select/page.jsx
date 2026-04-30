'use client';

/**
 * /book/select — choose a template (or resume an in-progress book).
 *
 * Stage 2 surface. Senior-friendly: large buttons, single-column,
 * no implicit defaults. The user picks a template; we POST to
 * /api/book/start which either resumes their existing book on that
 * template or creates a new one.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUserLang, titleOf } from '@/lib/i18nHelper';
import { BOOK_MSGS } from '@/lib/bookI18n';
import s from './page.module.css';

export default function BookSelectPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState([]);
  const [myBooks, setMyBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);
  const [lang, setLang] = useState('ko');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    // Stage 8 (i18n) — show only the templates that match the user's
    // language. The API falls back to "all templates" if the lang param
    // is missing, so the worst case is over-inclusive, never empty.
    const userLang = getUserLang();
    setLang(userLang);
    Promise.all([
      fetch(`/api/book/templates?lang=${encodeURIComponent(userLang)}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/book/list',      { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([t, b]) => {
      setTemplates(t.templates || []);
      setMyBooks((b.books || []).filter(bk => bk.status === 'in_progress'));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  async function startBook(templateId) {
    setStarting(templateId);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/book/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();
      if (data.bookId) {
        router.push(`/book/${data.bookId}`);
        return;
      }
    } catch {}
    setStarting(null);
  }

  const m = BOOK_MSGS[lang] || BOOK_MSGS.ko;

  if (loading) return <div className={s.loading}>{m.loading}</div>;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push('/')}>{m.backHome}</button>
        <h1 className={s.title}>{m.selectTitle}</h1>
      </header>

      {myBooks.length > 0 && (
        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.inProgress}</h2>
          {myBooks.map(b => (
            <button key={b.id} className={s.bookCard} onClick={() => router.push(`/book/${b.id}`)}>
              <div className={s.bookIcon}>📖</div>
              <div className={s.bookInfo}>
                {/* 🔥 Task 69 — localize via the template's i18n
                    name; falls back to whatever was stored. */}
                <div className={s.bookTitle}>{titleOf(b.template_name, lang) || b.title}</div>
                <div className={s.bookProgress}>
                  {m.progressLabel}: {b.completed_questions || 0} / {b.total_questions || 0}
                </div>
              </div>
              <div className={s.bookArrow}>→</div>
            </button>
          ))}
        </section>
      )}

      <section className={s.section}>
        <h2 className={s.sectionTitle}>
          {myBooks.length > 0 ? m.newBook : m.pickPrompt}
        </h2>
        {templates.map(t => {
          const name = titleOf(t.name, lang) || t.id;
          const desc = titleOf(t.description, lang);
          const icon =
            t.category === 'memoir' ? '📖' :
            t.category === 'family' ? '👨‍👩‍👧' :
            t.category === 'short'  ? '✨' : '📚';
          return (
            <button
              key={t.id}
              className={s.templateCard}
              onClick={() => startBook(t.id)}
              disabled={starting === t.id}
            >
              <div className={s.templateIcon}>{icon}</div>
              <div className={s.templateInfo}>
                <div className={s.templateTitle}>{name}</div>
                {desc && <div className={s.templateDesc}>{desc}</div>}
                <div className={s.templateMeta}>
                  {t.estimated_chapters} {m.metaChapters} · {t.estimated_questions} {m.metaQuestions} · {m.metaAbout} {t.estimated_pages} {m.metaPages}
                </div>
              </div>
              {starting === t.id && <div className={s.spinner}>…</div>}
            </button>
          );
        })}
      </section>
    </div>
  );
}
