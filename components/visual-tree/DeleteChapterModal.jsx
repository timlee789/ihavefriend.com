'use client';

/**
 * components/visual-tree/DeleteChapterModal.jsx
 *
 * 챕터 삭제 확인 모달.
 * DELETE /api/book/[bookId]/chapter/[chId]?preserve=true
 *
 * preserve=true → fragment.book_id/book_question_id NULL 처리되어
 * 답변은 free-form (/my-stories) 으로 보존.
 *
 * 답변 개수 표시: chapter.completed (V2 progress API 의 챕터별 응답에 있음).
 */

import { useState } from 'react';
import { titleOf } from '@/lib/i18nHelper';
import { TREE_MSGS } from './i18n';
import s from './ChapterEditModals.module.css';

export default function DeleteChapterModal({ bookId, chapter, lang = 'ko', onClose, onSuccess }) {
  const m = (TREE_MSGS[lang] || TREE_MSGS.ko).deleteModal;
  const title = titleOf(chapter?.title, lang) || '';
  // chapter.completed 는 progress API 가 반환하는 챕터별 답변 완료 카운트.
  // 만약 chapter detail API 가 questions 배열 + response_status 를 준다면 그걸로 직접 계산도 가능.
  const answeredCount = chapter?.completed ?? 0;
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/book/${bookId}/chapter/${chapter.id}?preserve=true`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || m.errorGeneric);
        setDeleting(false);
        return;
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('[DeleteChapterModal]', e);
      setError(m.errorNetwork);
      setDeleting(false);
    }
  };

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-chapter-title"
      >
        <h2 id="delete-chapter-title" className={`${s.modalTitle} ${s.modalTitleDanger}`}>
          {m.title}
        </h2>

        <p className={s.message}>{m.body(title || '—')}</p>

        {answeredCount > 0 ? (
          <p className={s.note}>{m.notePreserve(answeredCount)}</p>
        ) : (
          <p className={s.note}>{m.noteNoAnswers}</p>
        )}

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          <button
            type="button"
            className={s.btnCancel}
            onClick={onClose}
            disabled={deleting}
          >
            {m.cancel}
          </button>
          <button
            type="button"
            className={s.btnDanger}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? m.deleting : m.delete}
          </button>
        </div>
      </div>
    </div>
  );
}
