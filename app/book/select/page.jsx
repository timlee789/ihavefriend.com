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
import s from './page.module.css';

export default function BookSelectPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState([]);
  const [myBooks, setMyBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    Promise.all([
      fetch('/api/book/templates', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
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

  if (loading) return <div className={s.loading}>불러오는 중…</div>;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push('/')}>← 홈</button>
        <h1 className={s.title}>📚 책 만들기</h1>
      </header>

      {myBooks.length > 0 && (
        <section className={s.section}>
          <h2 className={s.sectionTitle}>진행 중인 책</h2>
          {myBooks.map(b => (
            <button key={b.id} className={s.bookCard} onClick={() => router.push(`/book/${b.id}`)}>
              <div className={s.bookIcon}>📖</div>
              <div className={s.bookInfo}>
                <div className={s.bookTitle}>{b.title}</div>
                <div className={s.bookProgress}>
                  진행: {b.completed_questions || 0} / {b.total_questions || 0}
                </div>
              </div>
              <div className={s.bookArrow}>→</div>
            </button>
          ))}
        </section>
      )}

      <section className={s.section}>
        <h2 className={s.sectionTitle}>
          {myBooks.length > 0 ? '새 책 만들기' : '어떤 책을 만들고 싶으세요?'}
        </h2>
        {templates.map(t => {
          const name = t.name?.ko || t.name?.en || t.id;
          const desc = t.description?.ko || t.description?.en || '';
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
                  {t.estimated_chapters}챕터 · {t.estimated_questions}질문 · 약 {t.estimated_pages}페이지
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
