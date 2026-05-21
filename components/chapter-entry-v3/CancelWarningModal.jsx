'use client';

/**
 * components/chapter-entry-v3/CancelWarningModal.jsx
 *
 * 답변 있는 카드의 ✕ 클릭 시 등장.
 * ⚠ + "정말로 이 질문을 취소할까요?" + 인용된 질문 + "답한 내용 N개가 모두 삭제됩니다" +
 * "한 번 삭제하면 되돌릴 수 없어요" + 두 버튼.
 *
 * Tim 의 영구 통찰 #26: "위험한 액션은 두 단계 확인 + 시각적 위험 표시."
 */

import { useEffect } from 'react';
import { ENTRY_MSGS } from './i18n';
import s from './ChapterEntryV3.module.css';

export default function CancelWarningModal({
  question,
  answeredCount = 1,
  onConfirm,
  onCancel,
  lang = 'ko',
}) {
  const m = (ENTRY_MSGS[lang] || ENTRY_MSGS.ko).cancelWarning;
  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className={s.modalOverlay} onClick={onCancel}>
      <div
        className={s.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-warning-title"
      >
        <div className={s.warningIcon} aria-hidden="true">
          <svg viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r="38" fill="#FEE8E8" />
            <text x="40" y="54" textAnchor="middle" fontSize="44" fontWeight="700" fill="#D03030">
              ⚠
            </text>
          </svg>
        </div>

        <h2 id="cancel-warning-title" className={s.modalTitle}>
          {m.title}
        </h2>

        <div className={s.modalQuoteBox}>
          <p className={s.modalQuote}>&ldquo;{question?.text || question?.prompt || ''}&rdquo;</p>
          <p className={s.modalDeleteNotice}>{m.deleteNotice(answeredCount)}</p>
          <p className={s.modalIrreversible}>{m.irreversible}</p>
        </div>

        <div className={s.modalButtons}>
          <button
            type="button"
            className={s.modalBtnSecondary}
            onClick={onCancel}
          >
            {m.cancelBtn}
          </button>
          <button
            type="button"
            className={s.modalBtnDanger}
            onClick={onConfirm}
          >
            {m.confirmBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
