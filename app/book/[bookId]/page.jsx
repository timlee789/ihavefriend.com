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
import Breadcrumb from '@/components/book/Breadcrumb';
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
    if (!token) {
      // 🔥 Task 74 — bounce back here after login.
      try { sessionStorage.setItem('postLoginRedirect', window.location.pathname); } catch {}
      router.replace('/login');
      return;
    }
    fetch(`/api/book/${bookId}/progress`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookId, router]);

  const m = BOOK_MSGS[lang] || BOOK_MSGS.ko;

  if (loading) return <div className={s.loading}>{m.loading}</div>;
  if (!data?.book) return <div className={s.loading}>{m.bookNotFound}</div>;

  // 🔥 Task 96 — suggested_next no longer destructured (the "다음 질문"
  //   card was removed from the page). API still returns it, so a
  //   future revival is just `data.suggested_next`.
  const { book, chapters } = data;
  const errFallback = { retry: m.failedRetry, generic: m.failedGeneric };
  const bookTitle = titleOf(book.title_i18n, lang) || book.title || m.bookDefaultTitle;

  return (
    <div className={s.container}>
      {/* 🔥 Sprint 2f (2026-05-10) — 헤더 2-row 패턴 (모바일 타이틀 잘림 해결):
            Row 1: [← 홈으로]  [안내][📋 목차]
            Row 2: 📚 자서전 제목 (full width, ellipsis 없음) */}
      <header className={s.header}>
        <div className={s.headerRow1}>
          <button className={s.backBtn} onClick={() => router.push('/')}>{m.backToHome}</button>
          <div className={s.headerRight}>
            {/* Milestone 5 Step 1 — V3 챕터 나무 (Tree View) 로 전환. */}
            <button
              className={s.viewToggleBtn}
              onClick={() => router.push(`/book/${bookId}/tree`)}
              aria-label={m.viewAsTree}
            >{m.viewAsTree}</button>
            <button
              className={s.helpBtn}
              onClick={() => router.push('/architect?from=book')}
              title={m.helpBtnTitle}
              aria-label={m.helpBtnTitle}
            >{m.helpBtn}</button>
            {/* Milestone 5 Step 1b — customizeBtn 헤더에서 제거 → 페이지 하단으로 이동.
                이유: 헤더 4개 버튼이 모바일에서 짤림. "내용 가져오는" 동작이라 하단 자연. */}
          </div>
        </div>
        <h1 className={s.title}>📚 {bookTitle}</h1>
      </header>

      {/* 🔥 Task 85 — Breadcrumb. On the book overview the only crumb
          is the book itself (current location). Chapter + question
          pages add deeper crumbs. */}
      <Breadcrumb items={[{ label: bookTitle }]} />

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

      {/* 🔥 Milestone 5 Step 4 (2026-05-21) — 게이트 제거.
          답변 1개 이상이면 미리보기/생성 둘 다 노출. AI intro 제거로 generate
          가 1~2초로 빨라져 percent 분기 (간단/정식) 도 불필요 — 둘 다 같은
          PDF 다 (미리보기는 새 탭, 생성은 다운로드 + book_generated 플래그). */}
      {book.completed_questions >= 1 && (
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
            {pdfBusy === 'preview' ? m.previewing : m.previewBtn}
          </button>

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
        </div>
      )}
      {pdfError && <div className={s.bookActionsError}>⚠️ {pdfError}</div>}

      {/* 🔥 Task 96 — "다음 질문" suggested-next card removed. Tim's
          beta polish: book home now shows only progress + chapter
          list, so the senior taps the chapter they want directly.
          The suggested_next field still arrives from /api/book/[id]/
          progress (no API change), it's just not rendered here. */}

      <h2 className={s.sectionTitle}>{m.chapterProgress}</h2>
      <div className={s.chapterList}>
        {chapters.map(ch => (
          <button
            key={ch.id}
            className={`${s.chapterRow} ${ch.is_current ? s.chapterCurrent : ''}`}
            // Milestone 5 Step 1c — V3 챕터 통일 (옵션 A). night mode V2 챕터 페이지 안 씀.
            //   ChapterEntryV3 의 handleAnswer 가 ?from=v3 자동 부여 → 질문 페이지 V3 모드.
            onClick={() => router.push(`/book/${bookId}/v3/chapter/${ch.id}`)}
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

      {/* Milestone 5 Step 1b — Table of contents (customize) 페이지 하단으로 이동.
          헤더에서 짤리던 버튼. "내용을 가져오는" 동작이라 하단이 자연스러움. */}
      <div className={s.tocFooter}>
        <button
          className={s.tocFooterBtn}
          onClick={() => router.push(`/book/${bookId}/customize`)}
          title={m.customizeTitle}
        >
          {m.customizeBtn}
        </button>
      </div>
    </div>
  );
}
