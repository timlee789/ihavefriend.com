'use client';

/**
 * components/visual-tree/RenameChapterModal.jsx
 *
 * 챕터 제목 바꾸기 모달.
 * PATCH /api/book/[bookId]/chapter/[chId] body { title: trimmed }
 *
 * V2 의 PATCH (Step 1d 단일 언어 정책) 가 책의 lang 자동 derive 후 그 키로 저장.
 * 다른 lang 키는 모두 제거됨 (단일 언어 정책).
 */

import { useState } from 'react';
import { titleOf } from '@/lib/i18nHelper';
import { TREE_MSGS } from './i18n';
import s from './ChapterEditModals.module.css';

export default function RenameChapterModal({ bookId, chapter, lang = 'ko', onClose, onSuccess }) {
  const m = (TREE_MSGS[lang] || TREE_MSGS.ko).renameModal;
  const currentTitle = titleOf(chapter?.title, lang) || '';
  const [newTitle, setNewTitle] = useState(currentTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = newTitle.trim();
  const canSave = trimmed.length > 0 && trimmed !== currentTitle && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      // V2 PATCH (Step 1d 단일 언어) — string 만 보냄. 서버가 책의 lang 자동 derive.
      const res = await fetch(`/api/book/${bookId}/chapter/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || m.errorGeneric);
        setSaving(false);
        return;
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('[RenameChapterModal]', e);
      setError(m.errorNetwork);
      setSaving(false);
    }
  };

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-chapter-title"
      >
        <h2 id="rename-chapter-title" className={s.modalTitle}>{m.title}</h2>

        <div className={s.currentBox}>
          <div className={s.currentLabel}>{m.currentLabel}</div>
          <div className={s.currentValue}>{currentTitle || m.emptyTitle}</div>
        </div>

        <label className={s.label} htmlFor="rename-input">{m.newLabel}</label>
        <input
          id="rename-input"
          type="text"
          className={s.input}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={m.placeholder}
          maxLength={50}
          autoFocus
          disabled={saving}
        />

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          <button
            type="button"
            className={s.btnCancel}
            onClick={onClose}
            disabled={saving}
          >
            {m.cancel}
          </button>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={handleSave}
            disabled={!canSave}
          >
            {saving ? m.saving : m.save}
          </button>
        </div>
      </div>
    </div>
  );
}
