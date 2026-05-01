'use client';

/**
 * components/fragments/FragmentModal.jsx  (Task 79)
 *
 * Lightweight, focused fragment-detail modal for the BOOK question
 * surface. Three jobs:
 *   1. show the FULL fragment body (markdown) so the senior can read
 *      past the 150-char preview that fits in the answer card,
 *   2. let them upload / replace / delete photos via PhotoUploader,
 *   3. surface a "이어서 말하기" path back into chat that continues
 *      this fragment as a new turn.
 *
 * Does NOT carry the visibility / collections / edit / admin
 * machinery that lives in the /my-stories FragmentModal — those
 * concepts don't apply to a book answer (private by definition;
 * scoped to the book question, not user collections). Keeping them
 * out keeps this file small and the book surface clean.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import PhotoUploader from '@/components/photos/PhotoUploader';
import s from './FragmentModal.module.css';

const MSGS = {
  ko: {
    backToQuestion : '← 질문',
    photosLabel    : '📷 사진',
    continueChat   : '✏️ 이어서 말하기',
    untitled       : '답변',
    closeAria      : '닫기',
  },
  en: {
    backToQuestion : '← Question',
    photosLabel    : '📷 Photos',
    continueChat   : '✏️ Continue speaking',
    untitled       : 'Answer',
    closeAria      : 'Close',
  },
  es: {
    backToQuestion : '← Pregunta',
    photosLabel    : '📷 Fotos',
    continueChat   : '✏️ Seguir hablando',
    untitled       : 'Respuesta',
    closeAria      : 'Cerrar',
  },
};

export default function FragmentModal({
  fragment,
  lang = 'ko',
  onClose,
  onPhotosChanged,        // (fragmentId, photos[]) — same shape as /my-stories
  onContinue,             // optional override; default routes to /chat?continueFragmentId=...
}) {
  const router = useRouter();
  const m = MSGS[String(lang).toLowerCase()] || MSGS.ko;

  // Close on Escape (desktop) for keyboard users.
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') onClose && onClose();
  }, [onClose]);
  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (!fragment) return null;

  function defaultContinue() {
    const url = `/chat?mode=story&continueFragmentId=${encodeURIComponent(fragment.id)}`;
    router.push(url);
  }

  return (
    <div
      className={s.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
    >
      <div className={s.modal} role="dialog" aria-modal="true">
        <div className={s.handle} aria-hidden />

        <header className={s.header}>
          <button className={s.backBtn} onClick={onClose} aria-label={m.closeAria}>
            {m.backToQuestion}
          </button>
          <div className={s.headerText}>
            <div className={s.title}>{fragment.title || m.untitled}</div>
            {fragment.subtitle && (
              <div className={s.subtitle}>{fragment.subtitle}</div>
            )}
          </div>
        </header>

        <div className={s.body}>
          <div className={s.content}>
            <ReactMarkdown>{fragment.content || ''}</ReactMarkdown>
          </div>

          {/* Photos */}
          <div className={s.photosSection}>
            <div className={s.photosLabel}>{m.photosLabel}</div>
            <PhotoUploader
              fragmentId={fragment.id}
              lang={String(lang).toLowerCase()}
              onChange={(photos) =>
                onPhotosChanged && onPhotosChanged(fragment.id, photos)
              }
            />
          </div>

          {/* Continue speaking */}
          <button
            className={s.continueBtn}
            onClick={onContinue || defaultContinue}
          >
            {m.continueChat}
          </button>
        </div>
      </div>
    </div>
  );
}
