'use client';

/**
 * components/chapter-entry-v3/RenameTopicModal.jsx
 *
 * Step 2h — saved 챕터 카드의 ✎ 클릭 시 등장. 주제 제목 (prompt) 만 바꿈.
 * 삭제는 별도 Step 으로 분리 (Tim 의 결정: 옵션 A).
 *
 * Props:
 *   bookId
 *   question  — { id, text } (text 는 현재 lang 에서 추출된 평문)
 *   lang
 *   onClose
 *   onSuccess — refetch 트리거
 *
 * 동작:
 *   - 현재 제목 readonly 표시
 *   - textarea 에 현재 제목 미리 입력 → 사용자 수정
 *   - "저장" 클릭 → PATCH /api/book/:bookId/question/:qId { prompt: text }
 *   - 빈 문자열 검증, 변경 없음 시 그냥 close (API 호출 X)
 *   - 책 language 단일 키 정책 — API 가 알아서 { [bookLang]: text } 로 저장
 */

import { useEffect, useState } from 'react';
import { ENTRY_MSGS } from './i18n';
import s from './ChapterEntryV3.module.css';

export default function RenameTopicModal({
  bookId,
  question,
  lang = 'ko',
  onClose,
  onSuccess,
}) {
  const m = ENTRY_MSGS[lang] || ENTRY_MSGS.ko;
  const mm = m.renameTopicModal;

  const currentText = (question?.text || '').trim();
  const [newPrompt, setNewPrompt] = useState(currentText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ESC 로 닫기 (saving 중엔 무시)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const handleSave = async () => {
    if (saving) return;
    const trimmed = (newPrompt || '').trim();
    if (!trimmed) {
      setError(mm.errorEmpty);
      return;
    }
    if (trimmed === currentText) {
      // 변경 없음 — API 호출 없이 그냥 닫기
      onClose?.();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`/api/book/${bookId}/question/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || mm.errorGeneric);
        setSaving(false);
        return;
      }
      await onSuccess?.();
      onClose?.();
    } catch (e) {
      console.error('[RenameTopicModal]', e);
      setError(mm.errorNetwork);
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
        aria-labelledby="rename-topic-title"
      >
        <h2 id="rename-topic-title" className={s.modalTitle}>{mm.title}</h2>

        <label className={s.modalLabel}>
          {mm.currentLabel}
          <div className={s.modalReadonly}>{currentText || '—'}</div>
        </label>

        <label className={s.modalLabel}>
          {mm.newLabel}
          <textarea
            className={s.modalTextarea}
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder={mm.placeholder}
            rows={3}
            autoFocus
            disabled={saving}
          />
        </label>

        {error && <p className={s.modalError}>{error}</p>}

        <div className={s.modalButtons}>
          <button
            type="button"
            className={s.modalBtnSecondary}
            onClick={onClose}
            disabled={saving}
          >
            {mm.cancel}
          </button>
          <button
            type="button"
            className={s.modalBtnPrimary}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? mm.saving : mm.save}
          </button>
        </div>
      </div>
    </div>
  );
}
