'use client';

/**
 * /book/[bookId]/question/[qId] — single question detail.
 *
 * Stage 2 surface: read-only. The big "🎙️ 답변 시작하기" lights up in
 * Stage 3 when BookHelperChat is wired in. Stage 5 adds the
 * "📥 기존 이야기 가져오기" path so the user can pull an existing
 * free-form fragment in as the answer to this question (without
 * moving it out of /my-stories).
 *
 * Touches the book's last_question_id on mount so the "resume where
 * you left off" affordance on the overview page works.
 */

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { getUserLang, titleOf } from '@/lib/i18nHelper';
import { BOOK_MSGS } from '@/lib/bookI18n';
import FragmentModal from '@/components/fragments/FragmentModal';
import Breadcrumb from '@/components/book/Breadcrumb';
import s from './page.module.css';

// Milestone 4 Step A — useSearchParams 는 Next.js App Router 에서 Suspense 경계 요구.
// 'use client' 페이지여도 빌드 안정성을 위해 래핑.
export default function QuestionDetailPage() {
  return (
    <Suspense fallback={<div className={s.loading} />}>
      <QuestionDetailPageInner />
    </Suspense>
  );
}

function QuestionDetailPageInner() {
  const router = useRouter();
  const { bookId, qId } = useParams();
  // Milestone 4 Step A — V3 origin tracking. from=v3 면 V3 챕터로 복귀.
  const searchParams = useSearchParams();
  const fromV3 = searchParams.get('from') === 'v3';
  const v3ChId = searchParams.get('chId');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('ko');
  useEffect(() => { setLang(getUserLang()); }, []);

  // 🆕 Stage 5 — fragment importer state
  const [importerOpen,        setImporterOpen]        = useState(false);
  const [suggestions,         setSuggestions]         = useState([]);
  const [loadingSuggestions,  setLoadingSuggestions]  = useState(false);
  const [importing,           setImporting]           = useState(null); // fragmentId mid-flight
  const [importError,         setImportError]         = useState('');
  // 🔥 Task 83 — answer fragments now render inline (FragmentModal
  //   inline=true). The previous click-to-open card flow is gone, so
  //   the openFragment state is no longer needed.

  const loadDetail = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    try {
      const res = await fetch(`/api/book/${bookId}/question/${qId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setData(d);
    } catch {} finally {
      setLoading(false);
    }
  }, [bookId, qId, router]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    // Fire-and-forget: stamp last visited question.
    fetch(`/api/book/${bookId}/touch-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId: qId }),
    }).catch(() => {});
    loadDetail();
  }, [bookId, qId, router, loadDetail]);

  async function skip() {
    const token = localStorage.getItem('token');
    await fetch(`/api/book/${bookId}/skip-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId: qId }),
    }).catch(() => {});
    if (data?.navigation?.next_question_id) {
      router.push(`/book/${bookId}/question/${data.navigation.next_question_id}`);
    } else {
      router.push(`/book/${bookId}`);
    }
  }

  async function openImporter() {
    setImporterOpen(true);
    setLoadingSuggestions(true);
    setImportError('');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/book/${bookId}/question/${qId}/suggestions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setSuggestions(json.suggestions || []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function importFragment(fragmentId) {
    setImporting(fragmentId);
    setImportError('');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/book/${bookId}/question/${qId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fragmentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setImportError(err.message || err.error || 'import failed');
        return;
      }
      setImporterOpen(false);
      await loadDetail();          // refresh inline so the imported fragment row appears
    } finally {
      setImporting(null);
    }
  }

  // 🆕 Stage 7 — read the question prompt aloud. Senior eyes get
  //   tired, so we offer a "🔊" button that uses the browser
  //   SpeechSynthesis API at a slightly slower rate. We do NOT lean on
  //   our broken Task 46 TTS path — this is a one-shot read of a short
  //   prompt, not the whole conversation.
  function speakPrompt() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const text = (data?.question?.prompt && titleOf(data.question.prompt, lang)) || '';
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'ko-KR';
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  async function removeImport(fragmentId) {
    const mLocal = BOOK_MSGS[lang] || BOOK_MSGS.ko;
    if (!confirm(mLocal.confirmCancelImport)) return;
    const token = localStorage.getItem('token');
    try {
      await fetch(`/api/book/${bookId}/question/${qId}/import?fragmentId=${fragmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadDetail();
    } catch {}
  }

  const m = BOOK_MSGS[lang] || BOOK_MSGS.ko;
  const dateLocale = lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'ko-KR';

  if (loading) return <div className={s.loading}>{m.loading}</div>;
  if (!data?.question) return <div className={s.loading}>{m.questionNotFound}</div>;

  const { question, chapter, response, navigation, book } = data;
  const promptText   = titleOf(question.prompt, lang);
  const hintText     = titleOf(question.hint, lang);
  const chapterText  = titleOf(chapter.title, lang);
  const bookTitle    = (book && (titleOf(book.title_i18n, lang) || book.title)) || m.bookDefaultTitle;
  const directList   = response.fragments || [];
  const importedList = response.imported_fragments || [];

  // Milestone 4 Step A — from=v3 면 V3 챕터로, 아니면 V2 챕터로.
  //   v3ChId 가 query 에 있으면 우선, 없으면 data.chapter.id fallback.
  const chapterReturnPath = (chapterId) =>
    fromV3
      ? `/book/${bookId}/v3/chapter/${v3ChId || chapterId}`
      : `/book/${bookId}/chapter/${chapterId}`;

  // Milestone 5 Step 1c — 챕터 제목 truncate (8글자 + …). "Chapter N" 내부 번호 대신
  //   사용자가 인지하는 챕터 제목을 보여줌. V3 흐름에서 사용자는 챕터 번호 모름.
  const shortChapter = (txt) => {
    const t = (txt || '').trim();
    return t.length > 8 ? `${t.slice(0, 8)}…` : t;
  };

  // /chat, /write 로 from=v3 전파 — Step B 가 이걸 받아 복귀 처리.
  const originSuffix = fromV3
    ? `&from=v3&chId=${encodeURIComponent(v3ChId || '')}`
    : '';

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button
          className={s.backBtn}
          onClick={() => router.push(chapterReturnPath(chapter.id))}
        >
          {fromV3 ? m.backToTopics : `${m.backToChapter} ${chapter.order}`}
        </button>
      </header>

      {/* 🔥 Task 85 — 3-step Breadcrumb. Milestone 4 Step A: from=v3 면 V3 경로/문구.
          Step 1c: V3 분기 챕터 라벨 truncate (긴 제목 8글자 + …). */}
      <Breadcrumb items={fromV3 ? [
        { label: bookTitle, href: `/book/${bookId}` },
        { label: shortChapter(chapterText), href: chapterReturnPath(chapter.id) },
        { label: m.topicPrefix },
      ] : [
        { label: bookTitle, href: `/book/${bookId}` },
        { label: `${m.chapterPrefix} ${chapter.order}`, href: `/book/${bookId}/chapter/${chapter.id}` },
        { label: `${m.questionPrefix} ${question.order}` },
      ]} />

      {/* Step 1c — V3 면 챕터 제목만 (번호 없이, 8글자 truncate). V2 는 "Chapter N: 제목". */}
      <div className={s.breadcrumb}>
        {fromV3
          ? shortChapter(chapterText)
          : `${m.chapterPrefix} ${chapter.order}: ${chapterText}`}
      </div>
      {/* Step A2 — V2 만 질문 번호 표시. V3 는 주제 콘셉이라 번호 없음. */}
      {!fromV3 && (
        <div className={s.questionNum}>{m.questionPrefix} {question.order}</div>
      )}

      <div className={`${s.promptBox} ${fromV3 ? s.promptBoxCompact : ''}`}>
        {/* 🆕 Stage 7 — read the prompt aloud for senior eyes. */}
        <button
          type="button"
          className={s.speakBtn}
          onClick={speakPrompt}
          title={m.speakHint}
          aria-label={m.speakAria}
        >
          🔊
        </button>
        {/* Step A2 — V3 "이번 주제" 작은 라벨. V2 는 hide. */}
        {fromV3 && <div className={s.topicLabel}>{m.topicLabel}</div>}
        <div className={s.prompt}>{promptText}</div>
        {/* Step A2 — 힌트/예상시간 은 V2 에서만 표시. V3 는 콤팩트. */}
        {!fromV3 && hintText && (
          <div className={s.hint}>{m.hintPrefix} {hintText}</div>
        )}
        {!fromV3 && question.estimated_minutes && (
          <div className={s.meta}>{m.minutesLabel} {question.estimated_minutes} {m.minutesUnit}</div>
        )}
      </div>

      {/* 🔥 Task 83 — direct answers render as inline FragmentModal so
          the senior sees the full answer (body, photos, edit/delete,
          continuation thread) right where the old preview card sat,
          without an extra tap. Multiple fragments stack vertically. */}
      {directList.length > 0 && (
        <div className={s.existingResponses}>
          <div className={s.existingLabel}>
            {directList.length > 1 ? m.multipleAnswers : m.previousAnswers}
          </div>
          {directList.map(f => (
            <FragmentModal
              key={f.id}
              fragment={f}
              inline={true}
              lang={String(lang || 'ko').toUpperCase()}
              onUpdated={() => loadDetail()}
              onPhotosChanged={() => loadDetail()}
              onDeleted={() => loadDetail()}
              // 🔥 Task 96 — book-aware return path for the typed
              //   editor: clicking "글 수정 / 이어쓰기" now sends
              //   the user back HERE, not /my-stories.
              // Milestone 4 Step A — V3 origin 전파 (Step B 가 FragmentModal 측 처리)
              bookContext={{ bookId, questionId: qId, fromV3, chId: v3ChId }}
            />
          ))}
        </div>
      )}

      {/* 🆕 Stage 5 — imported free-form fragments. Task 83: also inline.
          The "remove from book" button stays beside each modal because
          it's a question-page concern (not part of the FragmentModal). */}
      {importedList.length > 0 && (
        <div className={s.importedSection}>
          <div className={s.importedLabel}>{m.importedLabel}</div>
          {importedList.map(f => (
            <div key={f.id} className={s.importedInlineWrap}>
              <FragmentModal
                fragment={f}
                inline={true}
                lang={String(lang || 'ko').toUpperCase()}
                onUpdated={() => loadDetail()}
                onPhotosChanged={() => loadDetail()}
                onDeleted={() => loadDetail()}
                bookContext={{ bookId, questionId: qId, fromV3, chId: v3ChId }}
              />
              <button
                className={s.removeImportBtn}
                onClick={() => removeImport(f.id)}
              >
                {m.cancelImport}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 🆕 Stage 7 — completed section. Lights up after a fragment is
          saved (or imported). Big primary button to the next question
          + secondary button back to the book home. The primary
          recording button below this becomes "✏️ 다시 답변하기" so
          the senior can record an alternate take without losing the
          first one. */}
      {response.status === 'complete' && (
        <div className={s.completedSection}>
          <div className={s.completedLabel}>{m.saved}</div>
          {fromV3 ? (
            // Milestone 4 Step A — V3 흐름: 챕터 카드 그리드로 복귀 (방금 답한 카드 완료 상태).
            <button
              className={s.nextBigBtn}
              onClick={() => router.push(chapterReturnPath(chapter.id))}
            >
              {m.backToTopicsBig}
            </button>
          ) : (
            <>
              {navigation.next_question_id ? (
                <button
                  className={s.nextBigBtn}
                  onClick={() =>
                    router.push(`/book/${bookId}/question/${navigation.next_question_id}`)
                  }
                >
                  {m.nextQuestionBig}
                </button>
              ) : (
                <div className={s.completedHint}>{m.lastQuestionDone}</div>
              )}
              <button
                className={s.bookHomeBtn}
                onClick={() => router.push(`/book/${bookId}`)}
              >
                {m.backToBookHome}
              </button>
            </>
          )}
        </div>
      )}

      <div className={s.actions}>
        {response.status === 'complete' ? (
          <button
            className={s.redoBtn}
            onClick={() => {
              if (confirm(m.confirmRedo)) {
                router.push(`/chat?mode=book&bookId=${bookId}&bookQuestionId=${qId}${originSuffix}`);
              }
            }}
          >
            {m.redoAnswer}
          </button>
        ) : (
          <button
            className={s.startBtn}
            onClick={() =>
              router.push(`/chat?mode=book&bookId=${bookId}&bookQuestionId=${qId}${originSuffix}`)
            }
          >
            {m.startAnswerBig}
          </button>
        )}

        {/* 🆕 Task 93 — typed-answer alternative for users who prefer
            (or need) the keyboard. /write?bookId=...&bookQuestionId=...
            saves a fragment then attaches it via the import endpoint
            (same surface /chat?mode=book uses), so the resulting
            response row is indistinguishable from a voice answer. */}
        <button
          className={s.writeBtn}
          onClick={() =>
            router.push(`/write?bookId=${encodeURIComponent(bookId)}&bookQuestionId=${encodeURIComponent(qId)}${originSuffix}`)
          }
        >
          {m.startWriteAnswer}
        </button>

        {/* 🆕 Stage 5 — open the importer */}
        <button className={s.importBtn} onClick={openImporter}>
          {m.importExisting}
        </button>

        {/* Milestone 4 Step A — V3 는 순차 흐름이 아니므로 skip/seeNext hide.
            V2 흐름 (from 없음) 일 때만 표시. */}
        <div className={s.secondaryActions}>
          {!fromV3 && question.is_optional && response.status !== 'complete' && (
            <button className={s.skipBtn} onClick={skip}>{m.skip}</button>
          )}
          {!fromV3 && navigation.next_question_id && response.status !== 'complete' && (
            <button
              className={s.skipBtn}
              onClick={() => router.push(`/book/${bookId}/question/${navigation.next_question_id}`)}
            >
              {m.seeNext}
            </button>
          )}
        </div>
      </div>

      {/* 🆕 Stage 5 — importer modal */}
      {importerOpen && (
        <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && setImporterOpen(false)}>
          <div className={s.modal}>
            <h3>{m.pickImport}</h3>
            <p className={s.modalIntro}>
              {m.importerHelp}
              <br />{m.importerHelp2}
            </p>

            {importError && <div className={s.importError}>⚠️ {importError}</div>}

            {loadingSuggestions ? (
              <div className={s.modalLoading}>{m.findingRelated}</div>
            ) : suggestions.length === 0 ? (
              <div className={s.modalEmpty}>
                {m.noFreeStories}<br />
                <button
                  className={s.linkBtn}
                  onClick={() => router.push('/chat?mode=story')}
                >
                  {m.startNewStory}
                </button>
              </div>
            ) : (
              <div className={s.suggestionsList}>
                {suggestions.map(f => (
                  <div key={f.id} className={s.suggestionCard}>
                    <div className={s.suggestionTitle}>
                      {f.title || m.untitled}
                      {f.relevance >= 7 && <span className={s.relevanceBadge}>{m.relevanceHigh}</span>}
                    </div>
                    <div className={s.suggestionDate}>
                      {f.created_at ? new Date(f.created_at).toLocaleDateString(dateLocale) : ''}
                    </div>
                    <div className={s.suggestionPreview}>{f.preview}</div>
                    <button
                      className={s.useBtn}
                      onClick={() => importFragment(f.id)}
                      disabled={importing === f.id}
                    >
                      {importing === f.id ? m.importing : m.useThisStory}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button className={s.modalClose} onClick={() => setImporterOpen(false)}>{m.close}</button>
          </div>
        </div>
      )}

      {/* 🔥 Task 83 — overlay FragmentModal removed; answers now render
          inline above (see directList / importedList sections). */}
    </div>
  );
}
