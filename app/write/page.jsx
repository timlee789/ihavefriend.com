'use client';

/**
 * /write — Text Fragment Writer (Task 93).
 *
 * Two flows in one page:
 *   1. Free-form: /write           → POST /api/fragments → /my-stories
 *   2. Book-mode: /write?bookId=X&bookQuestionId=Y
 *      → POST /api/fragments → POST /api/book/X/question/Y/import → /book/X/question/Y
 *
 * UI mirrors FragmentModal's edit mode (title + subtitle + content) so a
 * senior who edited a fragment before sees the same shape. Keyboard +
 * voice paths preserved elsewhere; this page is purely the typed entry.
 *
 * Photos: PhotoUploader is enabled only AFTER the first save, because the
 * uploader needs a real fragment.id. Until save the user sees a hint.
 *
 * Senior-friendly: 18-20px body text, generous padding, dark theme by
 * default. KO / EN / ES via localStorage('lang').
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PhotoUploader from '@/components/photos/PhotoUploader';
import s from './page.module.css';

const WRITE_MSGS = {
  KO: {
    pageTitle      : '글로 쓰기',
    pageTitleBook  : '글로 답변하기',
    backHome       : '← 뒤로',
    titleLabel     : '제목 *',
    titlePlaceholder: '예: 내 첫 차에 대한 추억',
    subtitleLabel  : '부제 (선택)',
    subtitlePlaceholder: '예: 1992년 봄, 빨간색 프라이드',
    contentLabel   : '내용 *',
    contentPlaceholder: '편하게 적으세요. 길게 쓰셔도 좋고, 짧게 쓰셔도 좋아요.',
    saveBtn        : '저장하기',
    savingBtn      : '저장 중…',
    savedBtn       : '저장됨 — 사진 추가하기 ↓',
    cancelBtn      : '취소',
    photosLabel    : '📷 사진 (저장 후 추가 가능)',
    photosHint     : '저장한 후에 사진을 최대 2장까지 첨부할 수 있어요.',
    photosNowBtn   : '📷 사진 추가하기',
    finishBtn      : '✓ 끝내기',
    bookFinishBtn  : '✓ 끝내고 질문으로 돌아가기',
    titleRequired  : '제목을 입력해 주세요.',
    contentRequired: '내용을 입력해 주세요.',
    saveError      : '저장에 실패했어요. 잠시 후 다시 시도해 주세요.',
    linkError      : '저장은 됐는데 책에 연결하지 못했어요. 내 이야기에서 다시 연결할 수 있어요.',
    charCountSuffix: '자',
    autosaveOff    : '자동 저장 안 됨 — 저장 버튼을 눌러주세요',
  },
  EN: {
    pageTitle      : 'Write a Story',
    pageTitleBook  : 'Write an Answer',
    backHome       : '← Back',
    titleLabel     : 'Title *',
    titlePlaceholder: 'e.g. Memories of my first car',
    subtitleLabel  : 'Subtitle (optional)',
    subtitlePlaceholder: 'e.g. Spring 1992, a red Pride',
    contentLabel   : 'Content *',
    contentPlaceholder: 'Write at your own pace. Long or short, both are fine.',
    saveBtn        : 'Save',
    savingBtn      : 'Saving…',
    savedBtn       : 'Saved — add photos ↓',
    cancelBtn      : 'Cancel',
    photosLabel    : '📷 Photos (available after saving)',
    photosHint     : 'Once saved, you can attach up to 2 photos.',
    photosNowBtn   : '📷 Add photos',
    finishBtn      : '✓ Done',
    bookFinishBtn  : '✓ Done — back to the question',
    titleRequired  : 'Please enter a title.',
    contentRequired: 'Please enter some content.',
    saveError      : "Couldn't save. Please try again in a moment.",
    linkError      : "Saved, but couldn't link to the book. You can re-link from My Stories.",
    charCountSuffix: 'chars',
    autosaveOff    : 'No autosave — please tap Save',
  },
  ES: {
    pageTitle      : 'Escribir una historia',
    pageTitleBook  : 'Escribir una respuesta',
    backHome       : '← Atrás',
    titleLabel     : 'Título *',
    titlePlaceholder: 'p. ej. Recuerdos de mi primer coche',
    subtitleLabel  : 'Subtítulo (opcional)',
    subtitlePlaceholder: 'p. ej. Primavera de 1992, un Pride rojo',
    contentLabel   : 'Contenido *',
    contentPlaceholder: 'Escribe a tu ritmo. Largo o corto, ambos están bien.',
    saveBtn        : 'Guardar',
    savingBtn      : 'Guardando…',
    savedBtn       : 'Guardado — añade fotos ↓',
    cancelBtn      : 'Cancelar',
    photosLabel    : '📷 Fotos (disponibles tras guardar)',
    photosHint     : 'Una vez guardado, puedes añadir hasta 2 fotos.',
    photosNowBtn   : '📷 Añadir fotos',
    finishBtn      : '✓ Listo',
    bookFinishBtn  : '✓ Listo — volver a la pregunta',
    titleRequired  : 'Por favor escribe un título.',
    contentRequired: 'Por favor escribe el contenido.',
    saveError      : 'No se pudo guardar. Inténtalo de nuevo en un momento.',
    linkError      : 'Guardado, pero no se pudo vincular al libro. Puedes volver a vincularlo desde Mis historias.',
    charCountSuffix: 'caract.',
    autosaveOff    : 'Sin autoguardado — pulsa Guardar',
  },
};

const TITLE_MAX    = 120;
const SUBTITLE_MAX = 200;
const CONTENT_MAX  = 20_000;

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

function Inner() {
  const router       = useRouter();
  const search       = useSearchParams();
  const bookId       = search.get('bookId') || null;
  const bookQId      = search.get('bookQuestionId') || null;
  const isBookMode   = !!(bookId && bookQId);

  const lang = useLang();
  const m    = WRITE_MSGS[lang] || WRITE_MSGS.KO;
  const langLower = lang.toLowerCase();

  const [token, setToken] = useState(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = localStorage.getItem('token');
    if (!t) {
      // Bounce visitors to /login, preserving the post-login redirect.
      try {
        sessionStorage.setItem('postLoginRedirect',
          window.location.pathname + window.location.search);
      } catch {}
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  // Form state — same shape as FragmentModal edit mode.
  const [title,    setTitle]    = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content,  setContent]  = useState('');

  // Save state.
  const [saving,         setSaving]         = useState(false);
  const [savedFragment,  setSavedFragment]  = useState(null); // { id, title, ... } once persisted
  const [linkErr,        setLinkErr]        = useState('');
  const [saveErr,        setSaveErr]        = useState('');
  const [showPhotos,     setShowPhotos]     = useState(false);

  function validate() {
    setSaveErr('');
    if (!title.trim())   { setSaveErr(m.titleRequired);   return false; }
    if (!content.trim()) { setSaveErr(m.contentRequired); return false; }
    return true;
  }

  async function handleSave() {
    if (!token || saving || savedFragment) return;
    if (!validate()) return;
    setSaving(true);
    setSaveErr('');
    setLinkErr('');
    try {
      // 1. Create the fragment (free-form by default — book_id stays NULL on
      //    the row even when the page is in book mode; the import endpoint
      //    is what attaches it to the question).
      const res = await fetch('/api/fragments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title:    title.trim(),
          subtitle: subtitle.trim() || null,
          content:  content.trim(),
          language: langLower,
          generated_by: 'manual_write',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSaveErr(j.error || m.saveError);
        return;
      }
      const data = await res.json();
      const frag = data.fragment;
      if (!frag?.id) {
        setSaveErr(m.saveError);
        return;
      }
      setSavedFragment(frag);

      // 2. If we came from a book question, attach. Failure is non-fatal —
      //    fragment is alive in /my-stories and Tim can re-link manually.
      if (isBookMode) {
        try {
          const linkRes = await fetch(
            `/api/book/${encodeURIComponent(bookId)}/question/${encodeURIComponent(bookQId)}/import`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ fragmentId: frag.id }),
            }
          );
          if (!linkRes.ok) {
            setLinkErr(m.linkError);
          }
        } catch {
          setLinkErr(m.linkError);
        }
      }
    } catch (e) {
      setSaveErr(e?.message || m.saveError);
    } finally {
      setSaving(false);
    }
  }

  function handleFinish() {
    if (isBookMode) {
      // Book flow: even if linkErr, the fragment is alive — fall through
      // to /my-stories so the user can verify and manually re-link.
      if (linkErr) {
        router.push('/my-stories');
      } else {
        router.push(`/book/${encodeURIComponent(bookId)}/question/${encodeURIComponent(bookQId)}`);
      }
      return;
    }
    router.push('/my-stories');
  }

  function handleCancel() {
    if (isBookMode && bookId && bookQId) {
      router.push(`/book/${encodeURIComponent(bookId)}/question/${encodeURIComponent(bookQId)}`);
    } else {
      router.push('/');
    }
  }

  if (!token) {
    return <div className={s.loading} />;
  }

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={handleCancel}>
          {m.backHome}
        </button>
        <h1 className={s.pageTitle}>
          {isBookMode ? m.pageTitleBook : m.pageTitle}
        </h1>
      </header>

      {/* ── Form ────────────────────────────────────────────── */}
      <div className={s.form}>
        <label className={s.label}>{m.titleLabel}</label>
        <input
          type="text"
          className={s.input}
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={m.titlePlaceholder}
          disabled={!!savedFragment || saving}
          aria-label={m.titleLabel}
        />
        <div className={s.charCount}>{title.length} / {TITLE_MAX} {m.charCountSuffix}</div>

        <label className={s.label}>{m.subtitleLabel}</label>
        <input
          type="text"
          className={s.input}
          value={subtitle}
          maxLength={SUBTITLE_MAX}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder={m.subtitlePlaceholder}
          disabled={!!savedFragment || saving}
          aria-label={m.subtitleLabel}
        />

        <label className={s.label}>{m.contentLabel}</label>
        <textarea
          className={s.textarea}
          value={content}
          maxLength={CONTENT_MAX}
          onChange={(e) => setContent(e.target.value)}
          placeholder={m.contentPlaceholder}
          disabled={!!savedFragment || saving}
          aria-label={m.contentLabel}
          rows={14}
        />
        <div className={s.charCount}>
          {content.length.toLocaleString()} / {CONTENT_MAX.toLocaleString()} {m.charCountSuffix}
          {!savedFragment && <span className={s.autosaveNote}> · {m.autosaveOff}</span>}
        </div>

        {saveErr && <div className={s.errBanner}>⚠️ {saveErr}</div>}
        {linkErr && <div className={s.warnBanner}>⚠️ {linkErr}</div>}

        {/* ── Save / Finish actions ───────────────────────────── */}
        <div className={s.actions}>
          {!savedFragment ? (
            <>
              <button
                className={s.saveBtn}
                onClick={handleSave}
                disabled={saving || !title.trim() || !content.trim()}
              >
                {saving ? m.savingBtn : m.saveBtn}
              </button>
              <button className={s.cancelBtn} onClick={handleCancel} disabled={saving}>
                {m.cancelBtn}
              </button>
            </>
          ) : (
            <>
              <button
                className={s.finishBtn}
                onClick={handleFinish}
              >
                {isBookMode ? m.bookFinishBtn : m.finishBtn}
              </button>
              {!showPhotos && (
                <button
                  className={s.photosNowBtn}
                  onClick={() => setShowPhotos(true)}
                >
                  {m.photosNowBtn}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Photos (post-save only) ─────────────────────────── */}
        <div className={s.photosSection}>
          <div className={s.photosLabel}>{m.photosLabel}</div>
          {!savedFragment ? (
            <div className={s.photosHint}>{m.photosHint}</div>
          ) : showPhotos ? (
            <PhotoUploader
              fragmentId={savedFragment.id}
              lang={langLower}
            />
          ) : (
            <div className={s.photosHint}>{m.photosHint}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WritePage() {
  // useSearchParams() must be inside <Suspense> per Next.js 14+.
  return (
    <Suspense fallback={<div className={s.loading} />}>
      <Inner />
    </Suspense>
  );
}
