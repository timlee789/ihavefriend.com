'use client';

/**
 * /book/[bookId] — book overview / tree.
 *
 * Shows progress %, the next suggested question (single big action),
 * and a list of chapters. The senior should always know where they
 * are and what to do next.
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import s from './page.module.css';

function pickKo(value) {
  if (value && typeof value === 'object') return value.ko || value.en || value.es || '';
  return value || '';
}

export default function BookOverviewPage() {
  const router = useRouter();
  const { bookId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    fetch(`/api/book/${bookId}/progress`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookId, router]);

  if (loading) return <div className={s.loading}>불러오는 중…</div>;
  if (!data?.book) return <div className={s.loading}>책을 찾을 수 없어요.</div>;

  const { book, suggested_next, chapters } = data;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push('/book/select')}>← 책 목록</button>
        <h1 className={s.title}>📚 {book.title}</h1>
      </header>

      <div className={s.progressCard}>
        <div className={s.progressLabel}>
          {book.completion_percent}% 완성
          <span className={s.progressFraction}>
            {book.completed_questions} / {book.total_questions}
          </span>
        </div>
        <div className={s.progressBar}>
          <div className={s.progressFill} style={{ width: `${book.completion_percent}%` }} />
        </div>
        {book.book_eligible && (
          <div className={s.previewHint}>🎉 책 미리보기를 만들 수 있어요!</div>
        )}
      </div>

      {suggested_next && (
        <div className={s.nextCard}>
          <div className={s.nextLabel}>다음 질문</div>
          <div className={s.nextChapter}>📖 {pickKo(suggested_next.chapter_title)}</div>
          <div className={s.nextPrompt}>{pickKo(suggested_next.prompt)}</div>
          {suggested_next.hint && (
            <div className={s.nextHint}>💡 {pickKo(suggested_next.hint)}</div>
          )}
          <button
            className={s.nextBtn}
            onClick={() => router.push(`/book/${bookId}/question/${suggested_next.question_id}`)}
          >
            🎙️ 이 이야기 시작하기 →
          </button>
        </div>
      )}

      <h2 className={s.sectionTitle}>챕터별 진행 상황</h2>
      <div className={s.chapterList}>
        {chapters.map(ch => (
          <button
            key={ch.id}
            className={`${s.chapterRow} ${ch.is_current ? s.chapterCurrent : ''}`}
            onClick={() => router.push(`/book/${bookId}/chapter/${ch.id}`)}
          >
            <div className={s.chapterStatus}>
              {ch.status === 'complete'    ? '✅' :
               ch.status === 'in_progress' ? '🔄' : '⏸️'}
            </div>
            <div className={s.chapterInfo}>
              <div className={s.chapterTitle}>
                {ch.order}. {pickKo(ch.title)}
                {ch.is_custom && <span className={s.customBadge}>✏️</span>}
              </div>
              <div className={s.chapterProgress}>{ch.completed} / {ch.total}</div>
            </div>
            <div className={s.chapterArrow}>→</div>
          </button>
        ))}
      </div>
    </div>
  );
}
