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
import { getUserLang, titleOf } from '@/lib/i18nHelper';
import { BOOK_MSGS } from '@/lib/bookI18n';
import s from './page.module.css';

// 🆕 Stage 6 — PDF actions. Preview unlocks at 30%, real generate at
//   50%. Both stream the PDF body back from the API and the browser
//   either opens it in a new tab (preview) or saves it as a download
//   (generate). Errors are surfaced inline because the senior never
//   sees a Vercel toast — they need to know if the click did anything.
async function pdfPostAndOpen({ url, token, asDownload, downloadName, setBusy, setErr, errFallback }) {
  setBusy(true);
  setErr('');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.message || j.error || (errFallback?.retry || 'Something went wrong. Please try again.'));
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (asDownload) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = downloadName || 'book.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      window.open(blobUrl, '_blank');
    }
    // Free the blob URL after a beat — gives the new tab time to load.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  } catch (e) {
    setErr(e?.message || (errFallback?.generic || 'Something went wrong.'));
  } finally {
    setBusy(false);
  }
}

export default function BookOverviewPage() {
  const router = useRouter();
  const { bookId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('ko');
  useEffect(() => { setLang(getUserLang()); }, []);
  // 🆕 Stage 6 — pdf flow state. busy = which action is in flight
  // (avoid double-clicks during the 30–60s book generate path).
  const [pdfBusy, setPdfBusy] = useState(null); // 'preview' | 'generate' | null
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    fetch(`/api/book/${bookId}/progress`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookId, router]);

  const m = BOOK_MSGS[lang] || BOOK_MSGS.ko;

  if (loading) return <div className={s.loading}>{m.loading}</div>;
  if (!data?.book) return <div className={s.loading}>{m.bookNotFound}</div>;

  const { book, suggested_next, chapters } = data;
  const errFallback = { retry: m.failedRetry, generic: m.failedGeneric };

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push('/book/select')}>{m.backToList}</button>
        <h1 className={s.title}>📚 {book.title}</h1>
        <button
          className={s.customizeBtn}
          onClick={() => router.push(`/book/${bookId}/customize`)}
          title={m.customizeTitle}
        >
          {m.customizeBtn}
        </button>
      </header>

      <div className={s.progressCard}>
        <div className={s.progressLabel}>
          {book.completion_percent}% {m.completed}
          <span className={s.progressFraction}>
            {book.completed_questions} / {book.total_questions}
          </span>
        </div>
        <div className={s.progressBar}>
          <div className={s.progressFill} style={{ width: `${book.completion_percent}%` }} />
        </div>
        {book.book_eligible && (
          <div className={s.previewHint}>{m.bookEligible}</div>
        )}
      </div>

      {/* 🆕 Stage 7 — milestone encouragement cards. Task 67 i18n. */}
      {book.completion_percent >= 50 && book.completion_percent < 80 && (
        <div className={s.milestoneCard}>{m.milestone50}</div>
      )}
      {book.completion_percent >= 80 && book.completion_percent < 100 && (
        <div className={s.milestoneCard}>{m.milestone80}</div>
      )}
      {book.completion_percent >= 100 && (
        <div className={s.milestoneCard}>{m.milestone100}</div>
      )}

      {/* 🆕 Stage 6 — PDF actions. Preview unlocks at 30%, full
          generate at 50%. The generate path is heavier (Gemini chapter
          intros) so we lead the senior with a "1~2분 정도 걸려요"
          confirm before kicking off. */}
      {book.completion_percent >= 30 && (
        <div className={s.bookActions}>
          <button
            className={s.previewBtn}
            disabled={!!pdfBusy}
            onClick={() => pdfPostAndOpen({
              url: `/api/book/${bookId}/preview`,
              token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
              asDownload: false,
              setBusy: (b) => setPdfBusy(b ? 'preview' : null),
              setErr: setPdfError,
              errFallback,
            })}
          >
            {pdfBusy === 'preview' ? m.previewing :
              book.completion_percent < 50 ? m.previewSimpleBtn : m.previewBtn}
          </button>

          {book.completion_percent >= 50 && (
            <button
              className={s.generateBtn}
              disabled={!!pdfBusy}
              onClick={async () => {
                if (!confirm(m.confirmGenerate)) return;
                await pdfPostAndOpen({
                  url: `/api/book/${bookId}/generate`,
                  token: localStorage.getItem('token'),
                  asDownload: true,
                  downloadName: `${book.title || 'book'}.pdf`,
                  setBusy: (b) => setPdfBusy(b ? 'generate' : null),
                  setErr: setPdfError,
                  errFallback,
                });
              }}
            >
              {pdfBusy === 'generate' ? m.generating : m.generateBtn}
            </button>
          )}
        </div>
      )}
      {pdfError && <div className={s.bookActionsError}>⚠️ {pdfError}</div>}

      {suggested_next && (
        <div className={s.nextCard}>
          <div className={s.nextLabel}>{m.nextQuestion}</div>
          <div className={s.nextChapter}>📖 {titleOf(suggested_next.chapter_title, lang)}</div>
          <div className={s.nextPrompt}>{titleOf(suggested_next.prompt, lang)}</div>
          {suggested_next.hint && (
            <div className={s.nextHint}>💡 {titleOf(suggested_next.hint, lang)}</div>
          )}
          <button
            className={s.nextBtn}
            onClick={() => router.push(`/book/${bookId}/question/${suggested_next.question_id}`)}
          >
            {m.startThisStory}
          </button>
        </div>
      )}

      <h2 className={s.sectionTitle}>{m.chapterProgress}</h2>
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
                {ch.order}. {titleOf(ch.title, lang)}
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
