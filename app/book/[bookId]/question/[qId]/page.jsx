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

  async function selectFragment(fragmentId, type = 'direct') {
    const token = localStorage.getItem('token');
    try {
      await fetch(`/api/book/${bookId}/question/${qId}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fragmentId, type }),
      });
      await loadDetail();
    } catch {}
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
    if (!confirm('이 이야기를 책에서 제외할까요? (자유 이야기로는 그대로 남아 있어요.)')) return;
    const token = localStorage.getItem('token');
    try {
      await fetch(`/api/book/${bookId}/question/${qId}/import?fragmentId=${fragmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadDetail();
    } catch {}
  }

  if (loading) return <div className={s.loading}>불러오는 중…</div>;
  if (!data?.question) return <div className={s.loading}>질문을 찾을 수 없어요.</div>;

  const { question, chapter, response, navigation } = data;
  const promptText   = titleOf(question.prompt, lang);
  const hintText     = titleOf(question.hint, lang);
  const chapterText  = titleOf(chapter.title, lang);
  const directList   = response.fragments || [];
  const importedList = response.imported_fragments || [];

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button
          className={s.backBtn}
          onClick={() => router.push(`/book/${bookId}/chapter/${chapter.id}`)}
        >
          ← 챕터 {chapter.order}
        </button>
      </header>

      <div className={s.breadcrumb}>📖 챕터 {chapter.order}: {chapterText}</div>
      <div className={s.questionNum}>질문 {question.order}</div>

      <div className={s.promptBox}>
        {/* 🆕 Stage 7 — read the prompt aloud for senior eyes. Top-right
            so it doesn't push the prompt down on narrow screens. */}
        <button
          type="button"
          className={s.speakBtn}
          onClick={speakPrompt}
          title="질문 듣기"
          aria-label="질문 음성으로 듣기"
        >
          🔊
        </button>
        <div className={s.prompt}>{promptText}</div>
        {hintText && (
          <div className={s.hint}>💡 떠올려보면 좋은 것: {hintText}</div>
        )}
        {question.estimated_minutes && (
          <div className={s.meta}>📝 권장 시간: 약 {question.estimated_minutes}분</div>
        )}
      </div>

      {/* Direct answers (saved by /chat?mode=book sessions).
          🆕 Stage 7: when there's only one answer we keep the simple
          read-only card. When there are multiple we render the radio-
          select UI so the senior can pick which one ends up in the
          printed book. The select API mirrors the choice into
          response.selected_fragment_id (or selected_imported_id). */}
      {response.status === 'complete' && directList.length === 1 && (
        <div className={s.existingResponses}>
          <div className={s.existingLabel}>📝 이전 답변</div>
          {directList.map(f => (
            <div key={f.id} className={s.fragmentCard}>
              <div className={s.fragmentTitle}>{f.title || '답변'}</div>
              <div className={s.fragmentPreview}>
                {(f.content || '').substring(0, 150)}
                {(f.content || '').length > 150 ? '…' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {directList.length > 1 && (
        <div className={s.multipleResponses}>
          <div className={s.multipleLabel}>
            📝 답변이 여러 개 있어요. 책에 어떤 것을 사용할까요?
          </div>
          {directList.map((f, i) => {
            const isSelected = response.selected_fragment_id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                className={`${s.fragmentSelectCard} ${isSelected ? s.fragmentSelected : ''}`}
                onClick={() => selectFragment(f.id, 'direct')}
              >
                <span className={s.fragmentRadio}>{isSelected ? '🔘' : '⚪'}</span>
                <span className={s.fragmentBody}>
                  <span className={s.fragmentDate}>
                    답변 {i + 1} · {f.created_at ? new Date(f.created_at).toLocaleDateString('ko-KR') : ''}
                  </span>
                  <span className={s.fragmentText}>
                    {(f.content || '').substring(0, 200)}
                    {(f.content || '').length > 200 ? '…' : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 🆕 Stage 5 — imported free-form fragments */}
      {importedList.length > 0 && (
        <div className={s.importedSection}>
          <div className={s.importedLabel}>📥 가져온 이야기</div>
          {importedList.map(f => (
            <div key={f.id} className={`${s.fragmentCard} ${s.importedCard}`}>
              <div className={s.fragmentTitle}>{f.title || '답변'}</div>
              <div className={s.fragmentPreview}>
                {(f.content || '').substring(0, 150)}
                {(f.content || '').length > 150 ? '…' : ''}
              </div>
              <button
                className={s.removeImportBtn}
                onClick={() => removeImport(f.id)}
              >
                🗑️ 가져오기 취소
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
          <div className={s.completedLabel}>✨ 답변이 저장됐어요!</div>
          {navigation.next_question_id ? (
            <button
              className={s.nextBigBtn}
              onClick={() =>
                router.push(`/book/${bookId}/question/${navigation.next_question_id}`)
              }
            >
              🎙️ 다음 질문 →
            </button>
          ) : (
            <div className={s.completedHint}>마지막 질문까지 다 답하셨어요!</div>
          )}
          <button
            className={s.bookHomeBtn}
            onClick={() => router.push(`/book/${bookId}`)}
          >
            🏠 책 홈으로
          </button>
        </div>
      )}

      <div className={s.actions}>
        {response.status === 'complete' ? (
          <button
            className={s.redoBtn}
            onClick={() => {
              if (confirm('이전 답변은 그대로 저장되고, 새 답변이 추가돼요. 책 만들 때 둘 중 선택할 수 있어요. 계속할까요?')) {
                router.push(`/chat?mode=book&bookId=${bookId}&bookQuestionId=${qId}`);
              }
            }}
          >
            ✏️ 다시 답변하기
          </button>
        ) : (
          <button
            className={s.startBtn}
            onClick={() =>
              router.push(`/chat?mode=book&bookId=${bookId}&bookQuestionId=${qId}`)
            }
          >
            🎙️ 답변 시작하기 →
          </button>
        )}

        {/* 🆕 Stage 5 — open the importer */}
        <button className={s.importBtn} onClick={openImporter}>
          📥 기존 이야기 가져오기
        </button>

        <div className={s.secondaryActions}>
          {question.is_optional && response.status !== 'complete' && (
            <button className={s.skipBtn} onClick={skip}>⏭️ 건너뛰기</button>
          )}
          {navigation.next_question_id && response.status !== 'complete' && (
            <button
              className={s.skipBtn}
              onClick={() => router.push(`/book/${bookId}/question/${navigation.next_question_id}`)}
            >
              💭 다음 질문 보기
            </button>
          )}
        </div>
      </div>

      {/* 🆕 Stage 5 — importer modal */}
      {importerOpen && (
        <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && setImporterOpen(false)}>
          <div className={s.modal}>
            <h3>📥 가져올 이야기 선택</h3>
            <p className={s.modalIntro}>
              "내 이야기 남기기"에서 한 이야기 중 이 질문에 사용할 수 있는 것을 보여드려요.
              <br />가져와도 자유 이야기 (My Stories)에는 그대로 남아 있어요.
            </p>

            {importError && <div className={s.importError}>⚠️ {importError}</div>}

            {loadingSuggestions ? (
              <div className={s.modalLoading}>관련 이야기 찾는 중…</div>
            ) : suggestions.length === 0 ? (
              <div className={s.modalEmpty}>
                가져올 수 있는 자유 이야기가 없어요.<br />
                <button
                  className={s.linkBtn}
                  onClick={() => router.push('/chat?mode=story')}
                >
                  새 이야기 시작하기 →
                </button>
              </div>
            ) : (
              <div className={s.suggestionsList}>
                {suggestions.map(f => (
                  <div key={f.id} className={s.suggestionCard}>
                    <div className={s.suggestionTitle}>
                      {f.title || '제목 없음'}
                      {f.relevance >= 7 && <span className={s.relevanceBadge}>⭐ 관련 높음</span>}
                    </div>
                    <div className={s.suggestionDate}>
                      {f.created_at ? new Date(f.created_at).toLocaleDateString('ko-KR') : ''}
                    </div>
                    <div className={s.suggestionPreview}>{f.preview}</div>
                    <button
                      className={s.useBtn}
                      onClick={() => importFragment(f.id)}
                      disabled={importing === f.id}
                    >
                      {importing === f.id ? '가져오는 중…' : '✓ 이 이야기 사용'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button className={s.modalClose} onClick={() => setImporterOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
