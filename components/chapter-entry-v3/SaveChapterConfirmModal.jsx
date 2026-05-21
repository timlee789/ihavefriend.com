'use client';

/**
 * components/chapter-entry-v3/SaveChapterConfirmModal.jsx
 *
 * Step 2 — ChapterEntryV3 "저장하기" 버튼 클릭 시 등장하는 확인 모달.
 *
 * 사용자 7개 선택 후 "Save" 클릭 → 이 모달 → 확인 → POST /chapter/[chId]/save.
 *
 * Props:
 *   bookId, chapter, lang
 *   selectedIds  — 사용자 선택 + answered 자동 keep 된 ID 배열 (effective)
 *   onClose, onSuccess
 *
 * 동작:
 *   - 삭제될 질문 수 표시
 *   - "Answered automatically kept" 안내 (Tim 의 A+C 결정)
 *   - "Save" 시 POST /save 호출 후 onSuccess (부모에서 refetch + 토스트)
 */

import { useEffect, useState } from 'react';
import { titleOf } from '@/lib/i18nHelper';
import { ENTRY_MSGS } from './i18n';
import s from './ChapterEntryV3.module.css';

export default function SaveChapterConfirmModal({
  bookId,
  chapter,
  lang = 'ko',
  selectedIds = [],
  onClose,
  onSuccess,
}) {
  const m = (ENTRY_MSGS[lang] || ENTRY_MSGS.ko).saveModal;
  const title = titleOf(chapter?.title, lang) || '';
  const totalQs = (chapter?.questions || []).length;
  const deletedCount = Math.max(0, totalQs - selectedIds.length);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`/api/book/${bookId}/chapter/${chapter.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          keepQuestionIds: selectedIds,
          preserveAnswers: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === 'answered_must_be_kept') {
          setError(m.errorAnsweredMustKeep);
        } else {
          setError(data?.error || m.errorGeneric);
        }
        setSaving(false);
        return;
      }
      const data = await res.json();
      onSuccess?.(data);
      onClose?.();
    } catch (e) {
      console.error('[SaveChapterConfirmModal]', e);
      setError(m.errorNetwork);
      setSaving(false);
    }
  };

  return (
    <div className={s.modalOverlay} onClick={() => !saving && onClose?.()}>
      <div
        className={s.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-chapter-title"
      >
        <h2 id="save-chapter-title" className={s.modalTitle}>{m.title}</h2>

        <p className={s.modalQuote} style={{ whiteSpace: 'pre-line', marginTop: 0 }}>
          {m.bodyMain(title || '—', selectedIds.length, deletedCount)}
        </p>

        <p className={s.modalDeleteNotice} style={{ whiteSpace: 'pre-line' }}>
          {m.notePreserve}
        </p>

        {error && <p className={s.modalIrreversible}>{error}</p>}

        <div className={s.modalButtons}>
          <button
            type="button"
            className={s.modalBtnSecondary}
            onClick={onClose}
            disabled={saving}
          >
            {m.cancel}
          </button>
          <button
            type="button"
            className={s.modalBtnPrimary}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? m.saving : m.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
