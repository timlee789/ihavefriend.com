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
import s from './page.module.css';

// 🆕 Stage 6 — PDF actions. Preview unlocks at 30%, real generate at
//   50%. Both stream the PDF body back from the API and the browser
//   either opens it in a new tab (preview) or saves it as a download
//   (generate). Errors are surfaced inline because the senior never
//   sees a Vercel toast — they need to know if the click did anything.
async function pdfPostAndOpen({ url, token, asDownload, downloadName, setBusy, setErr }) {
  setBusy(true);
  setErr('');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.message || j.error || '실패했어요. 잠시 후 다시 시도해 주세요.');
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
    setErr(e?.message || '실패했어요.');
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

  if (loading) return <div className={s.loading}>불러오는 중…</div>;
  if (!data?.book) return <div className={s.loading}>책을 찾을 수 없어요.</div>;

  const { book, suggested_next, chapters } = data;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push('/book/select')}>← 책 목록</button>
        <h1 className={s.title}>📚 {book.title}</h1>
        <button
          className={s.customizeBtn}
          onClick={() => router.push(`/book/${bookId}/customize`)}
          title="챕터/질문 추가·수정·삭제"
        >
          ✏️ 구조 수정
        </button>
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

      {/* 🆕 Stage 7 — milestone encouragement cards. Senior gets a
          warm nudge at 50% and 80% so the long climb to a finished
          book feels less open-ended. */}
      {book.completion_percent >= 50 && book.completion_percent < 80 && (
        <div className={s.milestoneCard}>
          🎉 절반 넘으셨어요! 이제 책 미리보기를 만들 수 있어요.
        </div>
      )}
      {book.completion_percent >= 80 && book.completion_percent < 100 && (
        <div className={s.milestoneCard}>
          ✨ 거의 다 오셨어요! 책 만들기 준비가 됐어요.
        </div>
      )}
      {book.completion_percent >= 100 && (
        <div className={s.milestoneCard}>
          🏆 모든 질문에 답하셨어요! 정말 수고하셨어요.
        </div>
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
            })}
          >
            {pdfBusy === 'preview' ? '미리보기 만드는 중…' :
              book.completion_percent < 50 ? '📄 미리보기 (간단 버전)' : '📄 미리보기'}
          </button>

          {book.completion_percent >= 50 && (
            <button
              className={s.generateBtn}
              disabled={!!pdfBusy}
              onClick={async () => {
                if (!confirm('책을 만드시겠어요? 1~2분 정도 걸려요.')) return;
                await pdfPostAndOpen({
                  url: `/api/book/${bookId}/generate`,
                  token: localStorage.getItem('token'),
                  asDownload: true,
                  downloadName: `${book.title || 'book'}.pdf`,
                  setBusy: (b) => setPdfBusy(b ? 'generate' : null),
                  setErr: setPdfError,
                });
              }}
            >
              {pdfBusy === 'generate' ? '책 만드는 중…' : '📚 책 만들기 (정식)'}
            </button>
          )}
        </div>
      )}
      {pdfError && <div className={s.bookActionsError}>⚠️ {pdfError}</div>}

      {suggested_next && (
        <div className={s.nextCard}>
          <div className={s.nextLabel}>다음 질문</div>
          <div className={s.nextChapter}>📖 {titleOf(suggested_next.chapter_title, lang)}</div>
          <div className={s.nextPrompt}>{titleOf(suggested_next.prompt, lang)}</div>
          {suggested_next.hint && (
            <div className={s.nextHint}>💡 {titleOf(suggested_next.hint, lang)}</div>
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
