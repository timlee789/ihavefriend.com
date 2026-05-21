'use client';

/**
 * components/visual-tree/AddChapterModal.jsx
 *
 * 새 챕터 추가 모달.
 * POST /api/book/[bookId]/chapter body { title: { [lang]: newTitle } }
 *
 * description 은 입력받지 않음 — 사용자가 챕터 진입 시 ChapterEntryV3 가
 * 빈 질문 배열을 감지하여 LLM 으로 자동 생성 (Step 1 범위 밖).
 */

import { useState } from 'react';
import { TREE_MSGS } from './i18n';
import s from './ChapterEditModals.module.css';

export default function AddChapterModal({ bookId, lang = 'ko', onClose, onSuccess }) {
  const m = (TREE_MSGS[lang] || TREE_MSGS.ko).addModal;
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = title.trim();
  const canAdd = trimmed.length > 0 && !adding;

  const handleAdd = async () => {
    if (!canAdd) return;
    setAdding(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      // V2 POST (Step 1d 단일 언어) — string 만 보냄. 서버가 책의 lang 자동 derive.
      const res = await fetch(`/api/book/${bookId}/chapter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || m.errorGeneric);
        setAdding(false);
        return;
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('[AddChapterModal]', e);
      setError(m.errorNetwork);
      setAdding(false);
    }
  };

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-chapter-title"
      >
        <h2 id="add-chapter-title" className={s.modalTitle}>{m.title}</h2>

        <p className={s.helperText} style={{ whiteSpace: 'pre-line' }}>{m.helper}</p>

        <label className={s.label} htmlFor="add-chapter-input">{m.label}</label>
        <input
          id="add-chapter-input"
          type="text"
          className={s.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={m.placeholder}
          maxLength={50}
          autoFocus
          disabled={adding}
        />

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          <button
            type="button"
            className={s.btnCancel}
            onClick={onClose}
            disabled={adding}
          >
            {m.cancel}
          </button>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={handleAdd}
            disabled={!canAdd}
          >
            {adding ? m.adding : m.add}
          </button>
        </div>
      </div>
    </div>
  );
}
