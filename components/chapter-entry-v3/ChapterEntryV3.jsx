'use client';

/**
 * components/chapter-entry-v3/ChapterEntryV3.jsx
 *
 * 챕터 진입 화면 (V3 메인). status 따라 화면 전체 색 톤이 변함.
 *
 * 데이터 매핑:
 *   - V2 API 의 chapter.questions 배열 = V3 의 question_pool
 *   - 답변 상태: V2 의 response_status === 'complete' → answered
 *   - 사용자 선택 (selected_questions): localStorage 로 처리
 *     key 패턴: v3_selected_${bookId}_${chId}
 *
 * Day 1 한정 placeholder:
 *   - "새 질문 9개 보기" 클릭 → console.log 만 (Day 5 의 AI 작업)
 *   - 직접 만든 질문도 localStorage 의 custom_questions 에만 저장
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { titleOf } from '@/lib/i18nHelper';
import QuestionCard from './QuestionCard';
import CancelWarningModal from './CancelWarningModal';
import CreateQuestionModal from './CreateQuestionModal';
import SaveChapterConfirmModal from './SaveChapterConfirmModal';
import RenameTopicModal from './RenameTopicModal';
import { ENTRY_MSGS } from './i18n';
import s from './ChapterEntryV3.module.css';

const MAX_SELECTED = 7;
const MIN_SELECTED = 3;   // Step 2d — 최소 3개 (이하면 저장 disabled). 자유도 + 1~2개 가드.
const INITIAL_VISIBLE = 9; // 마지막 1자리는 "새 질문 박스" → 카드 9개 + 새 질문 박스 1개

// V2 status + is_current → V3 톤
function toneFor(chapterStatus, isCurrent) {
  if (chapterStatus === 'complete') return 'completed';
  if (chapterStatus === 'in_progress') return isCurrent ? 'active_recent' : 'in_progress';
  return 'not_started';
}

// 질문의 V3 상태 — 선택 + 답변 여부로 결정
//   Step 2g — saved 챕터에서는 chapter.questions[] 자체가 이미 저장된 선택 목록.
//   localStorage 없어도 (다른 기기 등) DB 기준으로 모두 selected 상태로 표시.
function questionState(q, selectedSet, answeredSet, chapterSaved = false) {
  if (chapterSaved) {
    // saved 챕터: 모든 카드가 자동 selected (DB 의 questions[] = 선택 목록)
    return answeredSet.has(q.id) ? 'selected_completed' : 'selected_in_progress';
  }
  const isSelected = selectedSet.has(q.id);
  if (!isSelected) return 'unselected';
  return answeredSet.has(q.id) ? 'selected_completed' : 'selected_in_progress';
}

const LS_KEY = (bookId, chId) => `v3_selected_${bookId}_${chId}`;
// Step 2b — customQuestions localStorage 폐기. DB 가 source of truth.
// 이전 LS_CUSTOM_KEY 데이터는 무시 (자연 cleanup — 사용자가 다시 방문해도 영향 X).

export default function ChapterEntryV3({
  bookId,
  chId,
  book,
  chapter,
  lang = 'ko',
  onChapterRefetch,  // Step 2b — page.jsx 가 전달. 질문 추가/저장 후 chapter 데이터 갱신.
}) {
  const router = useRouter();

  // localStorage 에서 선택 상태 복원 (selectedIds 만 — custom 은 이제 DB)
  const [selectedIds, setSelectedIds] = useState(/** @type {string[]} */ ([]));
  const [showAll, setShowAll] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [warnFor, setWarnFor] = useState(/** @type {object|null} */ (null));
  // hydrated: 복원이 끝나기 전까지 저장 Effect 가 빈 배열로 LS 를 덮어쓰지 못하도록 가드.
  const [hydrated, setHydrated] = useState(false);
  // generating: "새 질문 9개 보기" 박스가 LLM 호출 중인 상태.
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  // Step 2 — 저장 확인 모달
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  // Step 2h — saved 챕터 ✎ 클릭 시 등장하는 제목 바꾸기 모달. null | { id, text }
  const [renameTopicFor, setRenameTopicFor] = useState(null);
  // Step 2d — Step 2c 의 자동 9개 생성 제거 (LLM 토큰 비용 절약).
  // 사용자가 명시적으로 "Show 9 new topics" 클릭해야 LLM 호출.

  // 초기 로드 — localStorage 에서 selectedIds 복원 + 옛 임의 ID 자동 cleanup.
  //   Step 2c: chapter.questions[] 의 진짜 ID 와 교집합만 keep — 옛 `gen_xxx`/`custom_xxx`
  //   같은 임의 ID 가 남아 있어 save endpoint 가 invalid keep_ids 거부하던 문제 방지.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(LS_KEY(bookId, chId));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          if (chapter?.questions && chapter.questions.length > 0) {
            // DB 진짜 ID 집합과 교집합
            const validIds = new Set(chapter.questions.map(q => q.id));
            const cleaned = parsed.filter(id => validIds.has(id));
            setSelectedIds(cleaned);
            if (cleaned.length !== parsed.length) {
              try { localStorage.setItem(LS_KEY(bookId, chId), JSON.stringify(cleaned)); } catch {}
            }
          } else {
            // chapter.questions 아직 로딩 중 — parsed 그대로 (다음 effect 호출 시 교집합)
            setSelectedIds(parsed);
          }
        }
      }
    } catch { /* corrupt JSON, ignore */ }
    setHydrated(true);
  }, [bookId, chId, chapter?.questions]);

  // 옛 LS_CUSTOM_KEY 자동 cleanup — Step 2b 에서 폐기됨. 잔여 데이터 정리.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const legacyKey = `v3_custom_${bookId}_${chId}`;
      if (localStorage.getItem(legacyKey) !== null) {
        localStorage.removeItem(legacyKey);
      }
    } catch {}
  }, [bookId, chId]);

  // localStorage 동기화 — hydrated 후에만 저장 (race condition 방지)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hydrated) return;
    try { localStorage.setItem(LS_KEY(bookId, chId), JSON.stringify(selectedIds)); } catch {}
  }, [selectedIds, bookId, chId, hydrated]);

  // 데이터 변환 — V2 question = V3 question.
  // Step 2b: customQuestions 제거. chapter.questions[] (DB) 가 source of truth.
  //   사용자 직접 + AI 생성 모두 DB 에 저장되어 chapter.questions 에 들어옴.
  //   is_custom 으로 출처 구분 가능 (UI 시각 구별은 안 함, 영구 통찰 #27).
  const questions = useMemo(() => {
    return (chapter?.questions || []).map(q => ({
      id: q.id,
      text: titleOf(q.prompt, lang) || (typeof q.prompt === 'string' ? q.prompt : ''),
      isAnswered: q.response_status === 'complete',
      source: q.is_custom ? 'user_or_ai' : 'seed',
      isOptional: q.is_optional,
    }));
  }, [chapter, lang]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const answeredSet = useMemo(
    () => new Set(questions.filter(q => q.isAnswered).map(q => q.id)),
    [questions]
  );

  // Step 2 — Tim 의 A+C 결정: answered 질문은 자동으로 selected 에 포함 (저장 시).
  //   카드 UI 에서도 선택 + 잠금 상태로 표시 (사용자가 해제 못 함).
  //   저장 endpoint 검증도 answered 가 keepIds 에 있어야 함을 강제.
  const effectiveSelectedIds = useMemo(() => {
    const set = new Set(selectedIds);
    for (const id of answeredSet) set.add(id);
    return Array.from(set);
  }, [selectedIds, answeredSet]);
  const effectiveSelectedSet = useMemo(() => new Set(effectiveSelectedIds), [effectiveSelectedIds]);

  // UI 메시지 (lang 기반) — 책 자체는 단일 언어지만 UI 는 사용자 lang 따름.
  const m = ENTRY_MSGS[lang] || ENTRY_MSGS.ko;

  // status 톤
  const tone = toneFor(chapter?.status, chapter?.is_current);
  const chapterTitle = titleOf(chapter?.title, lang) || '';
  const completedCount = questions.filter(q => answeredSet.has(q.id) && selectedSet.has(q.id)).length;
  const selectedCount = effectiveSelectedIds.length;  // Step 2 — answered 자동 keep 포함
  // Step 2d — 3~7 범위 유연 저장. 7개 강제 → 3~7개 자유 선택.
  const isSaveReady = selectedCount >= MIN_SELECTED && selectedCount <= MAX_SELECTED;
  const isSaved = chapter?.saved === true;             // Step 2 — saved 챕터 UI 분기

  // 카드 노출 갯수 — INITIAL_VISIBLE 까지 자르거나 전체.
  // Step 2b: DB 에 is_custom 질문이 있으면 자동으로 전체 노출 (이전 customQuestions
  // 로직 대체). chapter.questions 에서 is_custom 여부로 판단.
  const hasAddedQuestions = (chapter?.questions || []).some(q => q.is_custom);
  const effectiveShowAll = showAll || hasAddedQuestions;
  const visibleQuestions = effectiveShowAll ? questions : questions.slice(0, INITIAL_VISIBLE);
  const hiddenCount = Math.max(0, questions.length - INITIAL_VISIBLE);

  // 액션 핸들러
  const handleSelect = (qid) => {
    // Step 2g — saved 챕터에서는 클릭 무시 (이미 선택 확정, 변경 없음)
    if (isSaved) return;
    if (selectedSet.has(qid)) return;
    if (selectedIds.length >= MAX_SELECTED) {
      alert(m.selectMaxAlert(MAX_SELECTED));
      return;
    }
    setSelectedIds(prev => [...prev, qid]);
  };

  const handleCancel = (qid) => {
    const q = questions.find(x => x.id === qid);
    if (!q) return;
    if (q.isAnswered) {
      // 답변 있음 → 경고 모달
      setWarnFor(q);
    } else {
      // 답변 없음 → 즉시 해제
      setSelectedIds(prev => prev.filter(id => id !== qid));
    }
  };

  const handleConfirmCancel = () => {
    if (!warnFor) return;
    // V2 의 답변 삭제는 별도 API 가 필요. Day 1 에서는 UI 만 — 선택만 해제하고
    // 실제 V2 fragment 삭제는 다음 작업에서 (skip-question API 활용 검토)
    setSelectedIds(prev => prev.filter(id => id !== warnFor.id));
    setWarnFor(null);
    // TODO: Day 3-4 — DELETE /api/book/${bookId}/question/${warnFor.id} 호출
  };

  const handleAnswer = (qid) => {
    // Milestone 4 Step A — V3 origin tracking. 답변 후 V3 챕터 복귀하도록 from=v3 + chId 전파.
    //   질문 상세 페이지가 from=v3 면 V3 경로 (/v3/chapter/[chId]) 로 복귀, 없으면 V2 경로.
    router.push(`/book/${bookId}/question/${qid}?from=v3&chId=${encodeURIComponent(chId)}`);
  };

  // Step 2h — saved 챕터 카드의 ✎ 클릭. 현재 question 의 평문을 모달에 전달.
  const handleRenameTopic = (qid) => {
    const q = questions.find(x => x.id === qid);
    if (!q) return;
    setRenameTopicFor(q);
  };

  // Step 2b — 사용자 직접 질문은 V2 single endpoint 로 즉시 DB INSERT.
  //   응답의 진짜 question.id 를 selectedIds 에 추가. 그 다음 chapter 데이터 refetch.
  const handleCreateCustom = async (text) => {
    if (selectedIds.length >= MAX_SELECTED) {
      alert(m.selectMaxAlert(MAX_SELECTED));
      return;
    }
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        alert(m.errorLoginNeeded);
        return;
      }
      const res = await fetch(`/api/book/${bookId}/chapter/${chId}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || m.errorGenerateFailed);
        return;
      }
      const data = await res.json();
      const newQuestionId = data?.question?.id;
      if (newQuestionId) {
        setSelectedIds(prev => [...prev, newQuestionId]);
      }
      setShowCreateModal(false);
      // chapter refetch — 새 질문이 chapter.questions[] 에 반영됨
      if (onChapterRefetch) await onChapterRefetch();
    } catch (e) {
      console.error('[handleCreateCustom]', e);
      alert(m.errorNetwork);
    }
  };

  const handleGenerateMore = async () => {
    if (generating) return; // 중복 호출 방지
    setGenerating(true);
    setGenerateError(null);

    // Gemini warm 응답 (1~2초) 시 로딩 UI 가 인지 임계값 아래로 사라지는 문제.
    // 최소 1.5초 보장 — 사용자가 "어떤 작업이 일어났구나" 시각적으로 확인 가능.
    const tLoadingStart = Date.now();

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        setGenerateError(m.errorLoginNeeded);
        setGenerating(false);
        return;
      }

      // 중복 회피용 기존 질문 텍스트 수집 (최대 50개)
      const existing = questions.map(q => q.text).filter(Boolean).slice(-50);

      const res = await fetch('/api/architect/generate-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chapterTitle: chapterTitle,
          chapterDescription: chapter?.description ? (titleOf(chapter.description, lang) || '') : '',
          language: lang,
          count: 9,
          existingQuestions: existing,
        }),
      });

      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        const msgKey = `message_${lang}`;
        const msg = data?.[msgKey] || data?.message_ko || m.errorQuota;
        setGenerateError(msg);
        return;
      }

      if (!res.ok) {
        setGenerateError(m.errorGenerateFailed);
        return;
      }

      const data = await res.json();
      const newQs = Array.isArray(data?.questions) ? data.questions : [];
      if (newQs.length === 0) {
        setGenerateError(m.errorEmpty);
        return;
      }

      // Step 2b — LLM 응답을 bulk endpoint 로 DB INSERT.
      //   진짜 question.id (q-gen-...) 를 chapter.questions[] 에 들어가 save endpoint 의
      //   keepIds 검증 통과 가능. customQuestions state 더 이상 안 씀.
      const bulkRes = await fetch(`/api/book/${bookId}/chapter/${chId}/question/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          questions: newQs.map(q => ({
            prompt: q.text,
            hint: q.hint || undefined,
          })),
        }),
      });
      if (!bulkRes.ok) {
        setGenerateError(m.errorGenerateFailed);
        return;
      }
      // DB 저장 성공 — chapter refetch 로 새 9개 반영
      if (onChapterRefetch) await onChapterRefetch();
      // 추가된 질문 즉시 보이도록
      setShowAll(true);
    } catch (err) {
      console.error('[generate-questions] failed:', err);
      setGenerateError(m.errorNetwork);
    } finally {
      // 로딩 상태 최소 1.5초 보장 (UX: 인지 임계값)
      const elapsed = Date.now() - tLoadingStart;
      if (elapsed < 1500) {
        await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
      }
      setGenerating(false);
    }
  };

  // 화면 톤별 클래스
  const toneClass = s[`tone_${tone}`] || s.tone_active_recent;

  // 완료 챕터의 상단 안내 문구
  const subtitleText = tone === 'completed' ? m.subtitleCompleted : m.subtitle;
  const titleText = tone === 'completed'
    ? m.titleCompleted(chapter?.questions?.length || MAX_SELECTED)
    : m.titleSelect;

  return (
    <div className={`${s.container} ${toneClass}`}>
      {/* 상단 — 뒤로가기 + 챕터 헤더 + 진행 칩 */}
      <header className={s.header}>
        <button
          type="button"
          className={s.backBtn}
          onClick={() => router.push(`/book/${bookId}/tree`)}
        >
          {m.backToTree}
        </button>

        <div className={s.chapterHead}>
          {/* 작은 챕터 열매 미니 (반지름 50px SVG) */}
          <svg viewBox="0 0 100 100" width="60" height="60" className={s.fruitMini} aria-hidden="true">
            <defs>
              <radialGradient id={`miniFruit_${tone}`} cx="0.35" cy="0.35" r="0.7">
                {tone === 'not_started'   && <><stop offset="0%" stopColor="#A8DC88" /><stop offset="100%" stopColor="#8AC868" /></>}
                {tone === 'in_progress'   && <><stop offset="0%" stopColor="#FBD969" /><stop offset="60%" stopColor="#F2B83A" /><stop offset="100%" stopColor="#D89A20" /></>}
                {tone === 'completed'     && <><stop offset="0%" stopColor="#F2A058" /><stop offset="100%" stopColor="#F08838" /></>}
                {tone === 'active_recent' && <><stop offset="0%" stopColor="#FBD969" /><stop offset="60%" stopColor="#F2B83A" /><stop offset="100%" stopColor="#D89A20" /></>}
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill={`url(#miniFruit_${tone})`} />
            <ellipse cx="36" cy="36" rx="12" ry="8" fill="rgba(255,255,255,0.4)" />
          </svg>

          <div className={s.chapterHeadText}>
            <h1 className={s.chapterTitle}>{chapterTitle}</h1>
            <p className={s.subtitle}>{titleText}</p>
            <p className={s.subtitleSmall}>{subtitleText}</p>
          </div>
        </div>

        <div className={s.progressChip}>
          <span className={s.chipMain}>{m.chipSelected(selectedCount, MAX_SELECTED)}</span>
          <span className={s.chipSep} aria-hidden>·</span>
          <span className={s.chipSub}>{m.chipCompleted(completedCount)}</span>
        </div>
      </header>

      {/* 카드 그리드 — generating 중엔 흐릿하게 + 클릭 차단 */}
      <div className={`${s.cardGrid} ${generating ? s.cardGridDimmed : ''}`}>
        {visibleQuestions.map(q => (
          <QuestionCard
            key={q.id}
            question={q}
            state={questionState(q, effectiveSelectedSet, answeredSet, isSaved)}
            onSelect={handleSelect}
            onCancel={handleCancel}
            onAnswer={handleAnswer}
            onEdit={handleRenameTopic}
            lang={lang}
            isAnsweredLocked={answeredSet.has(q.id)}
            chapterSaved={isSaved}
          />
        ))}

        {/* 그리드 마지막 자리 — "새 질문 9개 보기" 박스.
            generating 중엔 in-place 로 스피너 + 안내 (Tim 영구 통찰 #25).
            chapter.saved=true 면 hide (질문 추가 불가). */}
        {!isSaved && (
        <button
          type="button"
          className={`${s.newQuestionBox} ${generating ? s.newQuestionBoxLoading : ''}`}
          onClick={handleGenerateMore}
          disabled={generating}
          aria-busy={generating}
        >
          {generating ? (
            <>
              <div className={s.spinner} aria-hidden="true">
                <svg viewBox="0 0 50 50" width="32" height="32">
                  <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="4"
                          strokeDasharray="60 30" strokeLinecap="round" />
                </svg>
              </div>
              <div className={s.newQuestionTitle}>{m.generatingTitle}</div>
              <div className={s.newQuestionSubtitle}>
                {m.generatingSubtitle}
                <span className={s.pulseDot}>.</span>
                <span className={s.pulseDot}>.</span>
                <span className={s.pulseDot}>.</span>
              </div>
              <div className={s.loadingHint}>{m.generatingHint}</div>
            </>
          ) : (
            <>
              <div className={s.newQuestionIcon} aria-hidden="true">✨</div>
              <div className={s.newQuestionTitle}>{m.newQuestionTitle}</div>
              <div className={s.newQuestionCta}>{m.newQuestionCta}</div>
            </>
          )}
        </button>
        )}
      </div>

      {/* 새 질문 생성 에러 — 박스 아래, "↓ 더 보기" 링크 위 */}
      {generateError && !generating && (
        <p className={s.generateError} role="alert">
          {generateError}
          <button
            type="button"
            className={s.generateRetry}
            onClick={() => { setGenerateError(null); handleGenerateMore(); }}
          >
            {m.retry}
          </button>
        </p>
      )}

      {/* "↓ N개 질문 더 보기" 링크 — effectiveShowAll 사용 (custom 있으면 자동 펼침) */}
      {!effectiveShowAll && hiddenCount > 0 && (
        <button
          type="button"
          className={s.showMoreLink}
          onClick={() => setShowAll(true)}
        >
          {m.showMore(hiddenCount)}
        </button>
      )}

      {/* Step 2 — 저장하기 버튼 (chapter.saved=false 일 때만 표시).
          7개 정확히 선택됐을 때만 활성. answered 자동 keep 포함된 effectiveSelectedIds 기준. */}
      {!isSaved && (
        <div className={s.saveButtonContainer}>
          <button
            type="button"
            className={`${s.saveButton} ${isSaveReady ? s.saveButtonActive : ''}`}
            disabled={!isSaveReady}
            onClick={() => setSaveModalOpen(true)}
          >
            {m.saveButton.label(selectedCount, MAX_SELECTED, MIN_SELECTED)}
          </button>
        </div>
      )}

      {/* "+ 내가 직접 질문 만들기" — chapter.saved=true 시 hide */}
      {!isSaved && (
        <button
          type="button"
          className={s.createCustomBox}
          onClick={() => setShowCreateModal(true)}
        >
          <span className={s.createCustomIcon} aria-hidden="true">+</span>
          <span className={s.createCustomLabel}>{m.createCustom}</span>
        </button>
      )}

      {tone === 'completed' && selectedIds.length >= MAX_SELECTED && (
        <p className={s.completedNotice}>{m.completedNotice(MAX_SELECTED)}</p>
      )}

      {/* Step 2 — chapter.saved=true 시 안내. 사용자가 7개 답변 시작하라는 메시지. */}
      {isSaved && (
        <p className={s.savedChapterNotice}>
          <span className={s.savedBadge}>{m.savedBadge}</span>
          {' '}
          {m.savedChapterNotice(chapter?.questions?.length || 0)}
        </p>
      )}

      {/* 모달들 */}
      {warnFor && (
        <CancelWarningModal
          question={warnFor}
          answeredCount={1 /* TODO: V2 의 fragment_count 활용 */}
          onConfirm={handleConfirmCancel}
          onCancel={() => setWarnFor(null)}
          lang={lang}
        />
      )}
      {showCreateModal && (
        <CreateQuestionModal
          chapterTitle={chapterTitle}
          onSave={handleCreateCustom}
          onClose={() => setShowCreateModal(false)}
          lang={lang}
        />
      )}
      {saveModalOpen && (
        <SaveChapterConfirmModal
          bookId={bookId}
          chapter={chapter}
          lang={lang}
          selectedIds={effectiveSelectedIds}
          onClose={() => setSaveModalOpen(false)}
          onSuccess={async () => {
            // Step 2b — reload 대신 refetch (부드러운 갱신, 스크롤 위치 유지).
            try {
              localStorage.setItem(LS_KEY(bookId, chId), JSON.stringify(effectiveSelectedIds));
            } catch {}
            if (onChapterRefetch) await onChapterRefetch();
            // Step 2c — alert 제거. saved 모드 UI 변화 (배지 + savedChapterNotice) 로 충분히 인지.
          }}
        />
      )}
      {renameTopicFor && (
        <RenameTopicModal
          bookId={bookId}
          question={renameTopicFor}
          lang={lang}
          onClose={() => setRenameTopicFor(null)}
          onSuccess={async () => {
            if (onChapterRefetch) await onChapterRefetch();
          }}
        />
      )}
    </div>
  );
}
