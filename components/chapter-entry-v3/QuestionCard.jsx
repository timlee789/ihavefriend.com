'use client';

/**
 * components/chapter-entry-v3/QuestionCard.jsx
 *
 * 3가지 시각 상태:
 *   unselected           — 회색 테두리, + 아이콘, "누르면 선택됩니다" 안내
 *   selected_in_progress — 황금 테두리, ✕ 취소, 주황 "▶ 이어서 답하기"
 *   selected_completed   — 황금 테두리, ✕ 취소, 갈색 "▶ 수정하기"
 *
 * spec 명시 주의사항:
 *   - X 표시는 <text> 요소로 (font-size 20, font-weight 700) — path/line 가려질 위험
 *   - Hover 효과는 stroke + fill 만, transform 절대 X (깜박임 방지)
 *
 * 카드는 SVG 요소들의 조합 — 부모가 <svg> 안에서 렌더할 수도 있고,
 * 단독으로 표시할 수도 있도록 viewBox 가 있는 <svg> 로 wrap.
 */

import { useState } from 'react';
import { ENTRY_MSGS } from './i18n';
import s from './ChapterEntryV3.module.css';

const STATE_CLASSES = {
  unselected:           s.cardUnselected,
  selected_in_progress: s.cardInProgress,
  selected_completed:   s.cardCompleted,
};

export default function QuestionCard({
  question,
  state,                  // 'unselected' | 'selected_in_progress' | 'selected_completed'
  onSelect,
  onCancel,
  onAnswer,
  onEdit,                  // Step 2h — saved 챕터에서 ✎ 클릭 → 제목 바꾸기 모달
  lang = 'ko',
  isAnsweredLocked = false, // Step 2 — answered 자동 keep: ✕ hide + 클릭 무시
  chapterSaved = false,    // Step 2 — chapter.saved 시 모든 ✕ hide
}) {
  const m = ENTRY_MSGS[lang] || ENTRY_MSGS.ko;
  const [cancelHover, setCancelHover] = useState(false);
  const isSelected = state !== 'unselected';

  const handleCardClick = () => {
    if (state === 'unselected') onSelect?.(question.id);
  };

  const handleCancelClick = (e) => {
    e.stopPropagation();
    onCancel?.(question.id);
  };

  const handleAnswerClick = (e) => {
    e.stopPropagation();
    onAnswer?.(question.id);
  };

  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit?.(question.id);
  };

  // 질문 텍스트 — 너무 길면 2줄로 자름 (CSS line-clamp)
  const text = question.text || question.prompt || '';

  return (
    <div
      className={`${s.card} ${STATE_CLASSES[state]}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && state === 'unselected') {
          e.preventDefault();
          onSelect?.(question.id);
        }
      }}
      aria-pressed={isSelected}
    >
      {/* 상단 라벨 — 선택됨 상태에서만 */}
      {state === 'selected_in_progress' && (
        <div className={`${s.cardLabel} ${s.cardLabelProgress}`}>{m.cardLabelInProgress}</div>
      )}
      {state === 'selected_completed' && (
        <div className={`${s.cardLabel} ${s.cardLabelComplete}`}>{m.cardLabelCompleted}</div>
      )}

      {/* 우상단 ✕ 취소 버튼 — 선택됨 + 아직 saved 안 됨 + answered 잠금 X 일 때만 */}
      {isSelected && !chapterSaved && !isAnsweredLocked && (
        <button
          type="button"
          className={`${s.cancelBtn} ${cancelHover ? s.cancelBtnHover : ''}`}
          onClick={handleCancelClick}
          onMouseEnter={() => setCancelHover(true)}
          onMouseLeave={() => setCancelHover(false)}
          aria-label={m.cancelAriaLabel}
        >
          {/* X 는 SVG <text> 로 — path/line 은 일부 환경에서 가려질 수 있음 */}
          <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
            <circle cx="16" cy="16" r="16" fill={cancelHover ? '#FEE8E8' : 'transparent'} />
            <text
              x="16"
              y="22"
              textAnchor="middle"
              fontSize="20"
              fontWeight="700"
              fill={cancelHover ? '#D03030' : '#9A6810'}
            >×</text>
          </svg>
        </button>
      )}

      {/* Step 2h — saved 챕터: ✎ 편집 버튼 (✕ / 🔒 자리). 답변 유무 상관없이 표시. */}
      {chapterSaved && (
        <button
          type="button"
          className={s.editBtn}
          onClick={handleEditClick}
          aria-label={m.editTopicAriaLabel}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              fill="#5C4020"
            />
          </svg>
        </button>
      )}

      {/* answered 자동 keep 시 자물쇠 아이콘 (✕ 자리에) — saved 챕터에선 ✎ 가 대신 */}
      {isAnsweredLocked && !chapterSaved && (
        <div
          className={s.lockedIcon}
          title={m.cardAnsweredLocked}
          aria-label={m.cardAnsweredLocked}
        >
          🔒
        </div>
      )}

      {/* 미선택 카드 — 우상단 + 아이콘 */}
      {state === 'unselected' && (
        <div className={s.plusIcon} aria-hidden="true">+</div>
      )}

      {/* 질문 텍스트 */}
      <div className={s.cardText}>{text}</div>

      {/* 하단 안내 / 답하기 버튼 */}
      {state === 'unselected' && (
        <div className={s.cardHint}>{m.cardSelectHint}</div>
      )}
      {state === 'selected_in_progress' && (
        <button
          type="button"
          className={`${s.answerBtn} ${s.answerBtnOrange}`}
          onClick={handleAnswerClick}
        >
          {m.answerBtnContinue}
        </button>
      )}
      {state === 'selected_completed' && (
        <button
          type="button"
          className={`${s.answerBtn} ${s.answerBtnBrown}`}
          onClick={handleAnswerClick}
        >
          {m.answerBtnEdit}
        </button>
      )}
    </div>
  );
}
