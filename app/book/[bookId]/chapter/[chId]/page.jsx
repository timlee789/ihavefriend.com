'use client';

/**
 * /book/[bookId]/chapter/[chId] — chapter detail.
 *
 * Lists every active question in the chapter with its response status
 * and a small fragment count. Each row routes to the question detail
 * page where the user will (in Stage 3) actually start a session.
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUserLang, titleOf } from '@/lib/i18nHelper';
import { BOOK_MSGS } from '@/lib/bookI18n';
import Breadcrumb from '@/components/book/Breadcrumb';
import s from './page.module.css';

const STATUS_ICON = {
  empty:    '🍃',
  drafting: '🌱',
  complete: '🍂',
  skipped:  '⏭️',
};
function statusLabel(m, status) {
  return ({
    empty:    m.statusEmpty,
    drafting: m.statusDrafting,
    complete: m.statusComplete,
    skipped:  m.statusSkipped,
  })[status] || m.statusEmpty;
}

export default function ChapterDetailPage() {
  const router = useRouter();
  const { bookId, chId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('ko');
  useEffect(() => { setLang(getUserLang()); }, []);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    fetch(`/api/book/${bookId}/chapter/${chId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookId, chId, router]);

  const m = BOOK_MSGS[lang] || BOOK_MSGS.ko;

  if (loading) return <div className={s.loading}>{m.loading}</div>;
  if (!data?.chapter) return <div className={s.loading}>{m.chapterNotFound}</div>;

  const { chapter, book } = data;
  const completed = chapter.questions.filter(q => q.response_status === 'complete').length;
  const total = chapter.questions.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const bookTitle = (book && (titleOf(book.title_i18n, lang) || book.title)) || m.bookDefaultTitle;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push(`/book/${bookId}`)}>{m.backToBook}</button>
      </header>

      {/* 🔥 Task 85 — Breadcrumb: 책제목 › 챕터 N */}
      <Breadcrumb items={[
        { label: bookTitle, href: `/book/${bookId}` },
        { label: `${m.chapterPrefix} ${chapter.order}` },
      ]} />

      <h1 className={s.chapterTitle}>
        {m.chapterPrefix} {chapter.order}: {titleOf(chapter.title, lang)}
      </h1>

      <div className={s.progressBar}>
        <div className={s.progressFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={s.progressText}>{percent}% ({completed} / {total})</div>

      {chapter.description && (
        <p className={s.description}>{titleOf(chapter.description, lang)}</p>
      )}

      <h2 className={s.sectionTitle}>{m.questionList}</h2>
      <div className={s.questionList}>
        {chapter.questions.map(q => {
          const status = q.response_status || 'empty';
          const rowCls = `${s.questionRow} ${s[`status_${status}`] || ''}`.trim();
          return (
            <div key={q.id} className={rowCls}>
              <div className={s.questionStatus}>{STATUS_ICON[status] || '🍃'}</div>
              <div className={s.questionInfo}>
                <div className={s.questionPrompt}>
                  {q.order}. {titleOf(q.prompt, lang)}
                </div>
                {q.fragment_count > 0 && (
                  <div className={s.questionMeta}>
                    {lang === 'ko'
                      ? `${m.answerCount} ${q.fragment_count}${m.answerCountUnit}`
                      : `${q.fragment_count} ${m.answerCount}`} · {statusLabel(m, status)}
                  </div>
                )}
                {q.is_optional && status === 'empty' && (
                  <div className={s.optionalBadge}>{m.optionalBadge}</div>
                )}
              </div>
              <button
                className={s.questionBtn}
                onClick={() => router.push(`/book/${bookId}/question/${q.id}`)}
              >
                {status === 'complete' ? m.seeAnswer : m.startAnswer}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
