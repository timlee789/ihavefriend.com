'use client';

/**
 * components/chapter-entry-v3/CreateQuestionModal.jsx
 *
 * "+ 내가 직접 질문 만들기" 모달.
 *
 * Tim 의 영구 통찰 #28: "모달은 한 가지 일만 한다."
 * 4가지 요소만:
 *   1. ✕ 닫기 (우상단)
 *   2. 헤더 (✎ 아이콘 + 제목 + 부제 "{챕터명} 챕터에 추가할 질문을 작성하세요")
 *   3. 텍스트 입력 (440×140px) + 글자 수 카운터
 *   4. 하단 버튼 2개 ("취소" / "질문 저장하기")
 *
 * 7개 한도 체크는 부모 책임. 모달은 텍스트만 전달.
 */

import { useEffect, useState } from 'react';
import { ENTRY_MSGS } from './i18n';
import s from './ChapterEntryV3.module.css';

const MAX_LEN = 100;

export default function CreateQuestionModal({
  chapterTitle = '',
  onSave,
  onClose,
  lang = 'ko',
}) {
  const m = (ENTRY_MSGS[lang] || ENTRY_MSGS.ko).createQuestion;
  const [text, setText] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave?.(trimmed);
  };

  const canSave = text.trim().length > 0 && text.length <= MAX_LEN;

  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div
        className={s.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-question-title"
      >
        {/* 우상단 ✕ */}
        <button
          type="button"
          className={s.modalCloseBtn}
          onClick={onClose}
          aria-label={m.closeAria}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <text x="12" y="18" textAnchor="middle" fontSize="20" fontWeight="700" fill="#5C4020">
              ×
            </text>
          </svg>
        </button>

        {/* 헤더 */}
        <div className={s.modalHeader}>
          <div className={s.modalHeaderIcon} aria-hidden="true">✎</div>
          <h2 id="create-question-title" className={s.modalTitle}>
            {m.title}
          </h2>
          {chapterTitle && (
            <p className={s.modalSubtitle}>{m.subtitle(chapterTitle)}</p>
          )}
        </div>

        {/* 텍스트 입력 + 글자 수 카운터 */}
        <div className={s.modalTextareaWrap}>
          <textarea
            className={s.modalTextarea}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            placeholder={m.placeholder}
            rows={5}
            autoFocus
          />
          <div className={s.modalCounter}>{m.counter(text.length, MAX_LEN)}</div>
        </div>

        {/* 하단 버튼 2개 */}
        <div className={s.modalButtons}>
          <button
            type="button"
            className={s.modalBtnSecondary}
            onClick={onClose}
          >
            {m.cancelBtn}
          </button>
          <button
            type="button"
            className={s.modalBtnPrimary}
            onClick={handleSave}
            disabled={!canSave}
          >
            {m.saveBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
