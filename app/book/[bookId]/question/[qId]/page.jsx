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

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUserLang, titleOf } from '@/lib/i18nHelper';
import { BOOK_MSGS } from '@/lib/bookI18n';
import FragmentModal from '@/components/fragments/FragmentModal';
import Breadcrumb from '@/components/book/Breadcrumb';
import s from './page.module.css';

export default function QuestionDetailPage() {
  const router = useRouter();
  const { bookId, qId } = useParams();
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

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button
          className={s.backBtn}
          onClick={() => router.push(`/book/${bookId}/chapter/${chapter.id}`)}
        >
          {m.backToChapter} {chapter.order}
        </button>
      </header>

      {/* 🔥 Task 85 — 3-step Breadcrumb: 책제목 › 챕터 N › 질문 N. */}
      <Breadcrumb items={[
        { label: bookTitle, href: `/book/${bookId}` },
        { label: `${m.chapterPrefix} ${chapter.order}`, href: `/book/${bookId}/chapter/${chapter.id}` },
        { label: `${m.questionPrefix} ${question.order}` },
      ]} />

      <div className={s.breadcrumb}>{m.chapterPrefix} {chapter.order}: {chapterText}</div>
      <div className={s.questionNum}>{m.questionPrefix} {question.order}</div>

      <div className={s.promptBox}>
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
        <div className={s.prompt}>{promptText}</div>
        {hintText && (
          <div className={s.hint}>{m.hintPrefix} {hintText}</div>
        )}
        {question.estimated_minutes && (
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
        </div>
      )}

      <div className={s.actions}>
        {response.status === 'complete' ? (
          <button
            className={s.redoBtn}
            onClick={() => {
              if (confirm(m.confirmRedo)) {
                router.push(`/chat?mode=book&bookId=${bookId}&bookQuestionId=${qId}`);
              }
            }}
          >
            {m.redoAnswer}
          </button>
        ) : (
          <button
            className={s.startBtn}
            onClick={() =>
              router.push(`/chat?mode=book&bookId=${bookId}&bookQuestionId=${qId}`)
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
            router.push(`/write?bookId=${encodeURIComponent(bookId)}&bookQuestionId=${encodeURIComponent(qId)}`)
          }
        >
          {m.startWriteAnswer}
        </button>

        {/* 🆕 Stage 5 — open the importer */}
        <button className={s.importBtn} onClick={openImporter}>
          {m.importExisting}
        </button>

        <div className={s.secondaryActions}>
          {question.is_optional && response.status !== 'complete' && (
            <button className={s.skipBtn} onClick={skip}>{m.skip}</button>
          )}
          {navigation.next_question_id && response.status !== 'complete' && (
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
