'use client';

/**
 * /write — Text Fragment Writer (Tasks 93 + 94 + 95).
 *
 * Three flows in one page, selected by URL params:
 *
 *   1. NEW (free-form):     /write
 *      → POST /api/fragments → /my-stories
 *
 *   2. NEW (book answer):   /write?bookId=X&bookQuestionId=Y
 *      → POST /api/fragments
 *        → POST /api/book/X/question/Y/import
 *        → /book/X/question/Y
 *
 *   3. EDIT (Task 95):      /write?fragmentId=X
 *      Backward-compat alias: /write?continueFragmentId=X
 *      → GET /api/fragments/X to prefill form (title + subtitle + content)
 *      → PATCH /api/fragments/X on save
 *      → /my-stories
 *
 * Tim's call (2026-05-04) replaced Task 94's child-fragment continuation
 * with direct edit of the original. The voice-continuation path (chat?
 * continueFragment=…) still creates a child fragment — that flow is
 * untouched.
 *
 * Photos: PhotoUploader is enabled IMMEDIATELY in edit mode (the
 * fragment.id is known from the GET) and AFTER first save in create
 * mode (we need the id back from POST first).
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PhotoUploader from '@/components/photos/PhotoUploader';
import s from './page.module.css';

const WRITE_MSGS = {
  KO: {
    pageTitle      : '글로 쓰기',
    pageTitleBook  : '글로 답변하기',
    pageTitleEdit  : '이야기 다듬기',
    editInfoHint   : '💡 내용을 자유롭게 수정하거나 끝에 이어서 쓸 수 있어요.',
    editLoadFail   : '원본 이야기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    backHome       : '← 뒤로',
    titleLabel     : '제목 *',
    titlePlaceholder: '예: 내 첫 차에 대한 추억',
    subtitleLabel  : '부제 (선택)',
    subtitlePlaceholder: '예: 1992년 봄, 빨간색 프라이드',
    contentLabel   : '내용 *',
    contentPlaceholder: '편하게 적으세요. 길게 쓰셔도 좋고, 짧게 쓰셔도 좋아요.',
    saveBtn        : '저장하기',
    saveEditBtn    : '변경 저장',
    savingBtn      : '저장 중…',
    savedFlash     : '저장됨 ✓',
    cancelBtn      : '취소',
    photosLabel    : '📷 사진 (최대 2장)',
    photosHintCreate: '저장한 후에 사진을 최대 2장까지 첨부할 수 있어요.',
    photosNowBtn   : '📷 사진 추가하기',
    finishBtn      : '✓ 끝내기',
    finishEditBtn  : '✓ 끝내기',
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
    pageTitleEdit  : 'Refine Your Story',
    editInfoHint   : '💡 You can revise the existing words or keep writing at the end — both at once.',
    editLoadFail   : "Couldn't load the original story. Please try again in a moment.",
    backHome       : '← Back',
    titleLabel     : 'Title *',
    titlePlaceholder: 'e.g. Memories of my first car',
    subtitleLabel  : 'Subtitle (optional)',
    subtitlePlaceholder: 'e.g. Spring 1992, a red Pride',
    contentLabel   : 'Content *',
    contentPlaceholder: 'Write at your own pace. Long or short, both are fine.',
    saveBtn        : 'Save',
    saveEditBtn    : 'Save changes',
    savingBtn      : 'Saving…',
    savedFlash     : 'Saved ✓',
    cancelBtn      : 'Cancel',
    photosLabel    : '📷 Photos (up to 2)',
    photosHintCreate: 'Once saved, you can attach up to 2 photos.',
    photosNowBtn   : '📷 Add photos',
    finishBtn      : '✓ Done',
    finishEditBtn  : '✓ Done',
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
    pageTitleEdit  : 'Refinar tu historia',
    editInfoHint   : '💡 Puedes revisar lo que ya escribiste o seguir escribiendo al final — todo a la vez.',
    editLoadFail   : 'No se pudo cargar la historia original. Inténtalo de nuevo en un momento.',
    backHome       : '← Atrás',
    titleLabel     : 'Título *',
    titlePlaceholder: 'p. ej. Recuerdos de mi primer coche',
    subtitleLabel  : 'Subtítulo (opcional)',
    subtitlePlaceholder: 'p. ej. Primavera de 1992, un Pride rojo',
    contentLabel   : 'Contenido *',
    contentPlaceholder: 'Escribe a tu ritmo. Largo o corto, ambos están bien.',
    saveBtn        : 'Guardar',
    saveEditBtn    : 'Guardar cambios',
    savingBtn      : 'Guardando…',
    savedFlash     : 'Guardado ✓',
    cancelBtn      : 'Cancelar',
    photosLabel    : '📷 Fotos (hasta 2)',
    photosHintCreate: 'Una vez guardado, puedes añadir hasta 2 fotos.',
    photosNowBtn   : '📷 Añadir fotos',
    finishBtn      : '✓ Listo',
    finishEditBtn  : '✓ Listo',
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

  // 🆕 Task 95 — fragmentId is the new canonical edit param.
  //   continueFragmentId stays accepted as an alias so old links /
  //   old FragmentModal builds keep working through the same path.
  const fragmentId   = search.get('fragmentId') || search.get('continueFragmentId') || null;
  const bookId       = search.get('bookId') || null;
  const bookQId      = search.get('bookQuestionId') || null;
  // 🔥 Task 96 — return-path hints set by FragmentModal when the modal
  //   was opened from a book question page. Used by handleCancel +
  //   handleFinish to route the user back to /book/X/question/Y
  //   instead of dropping them at /my-stories.
  const fromBookId   = search.get('fromBookId')     || null;
  const fromQId      = search.get('fromQuestionId') || null;
  const isEdit       = !!fragmentId;
  const isBookMode   = !!(bookId && bookQId) && !isEdit;  // edit takes precedence

  const lang = useLang();
  const m    = WRITE_MSGS[lang] || WRITE_MSGS.KO;
  const langLower = lang.toLowerCase();

  const [token, setToken] = useState(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = localStorage.getItem('token');
    if (!t) {
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

  // Save / lifecycle state.
  const [saving,        setSaving]        = useState(false);
  const [savedFragment, setSavedFragment] = useState(null); // set after POST (create) or initial GET (edit)
  const [editLoading,   setEditLoading]   = useState(false);
  const [editLoadErr,   setEditLoadErr]   = useState('');
  const [linkErr,       setLinkErr]       = useState('');
  const [saveErr,       setSaveErr]       = useState('');
  const [editFlash,     setEditFlash]     = useState(false); // brief "saved ✓" pulse after PATCH
  const [showPhotos,    setShowPhotos]    = useState(false);

  // 🆕 Task 95 — edit mode prefill. Pull the fragment, populate the
  //   form, and set savedFragment={id,…} so PhotoUploader is usable
  //   immediately. The form fields stay editable in edit mode (unlike
  //   create mode, which locks after first save to prevent duplicates).
  useEffect(() => {
    if (!token || !fragmentId) return;
    let cancelled = false;
    setEditLoading(true);
    setEditLoadErr('');
    (async () => {
      try {
        const res = await fetch(`/api/fragments/${encodeURIComponent(fragmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setEditLoadErr(m.editLoadFail);
          return;
        }
        const data = await res.json();
        const f = data.fragment;
        if (!f?.id) {
          if (!cancelled) setEditLoadErr(m.editLoadFail);
          return;
        }
        if (cancelled) return;
        setTitle(f.title || '');
        setSubtitle(f.subtitle || '');
        setContent(f.content || '');
        setSavedFragment(f);
        setShowPhotos(true); // edit mode → uploader visible from the start
      } catch {
        if (!cancelled) setEditLoadErr(m.editLoadFail);
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, fragmentId, m]);

  function validate() {
    setSaveErr('');
    if (!title.trim())   { setSaveErr(m.titleRequired);   return false; }
    if (!content.trim()) { setSaveErr(m.contentRequired); return false; }
    return true;
  }

  async function handleSave() {
    if (!token || saving) return;
    // Create mode locks after first save; edit mode allows repeated saves.
    if (!isEdit && savedFragment) return;
    if (!validate()) return;
    setSaving(true);
    setSaveErr('');
    setLinkErr('');
    try {
      if (isEdit) {
        // ── EDIT (PATCH the original) ─────────────────────────────
        const res = await fetch(`/api/fragments/${encodeURIComponent(fragmentId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title:    title.trim(),
            subtitle: subtitle.trim() || null,
            content:  content.trim(),
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setSaveErr(j.error || m.saveError);
          return;
        }
        const data = await res.json();
        if (data.fragment?.id) setSavedFragment(data.fragment);
        // Brief "Saved ✓" indicator instead of locking the form — Tim
        // expects the senior to keep editing if they want.
        setEditFlash(true);
        setTimeout(() => setEditFlash(false), 1800);
        return;
      }

      // ── CREATE (POST a new fragment) ─────────────────────────────
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

      // If we came from a book question, attach. Failure is non-fatal —
      // fragment is alive in /my-stories and Tim can re-link manually.
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

  // 🔥 Task 96 — single helper for "where to send the user when they
  //   leave this page". Edit flow now respects the fromBookId /
  //   fromQuestionId hints so a user who opened the editor from a
  //   book question page is returned there instead of being dumped
  //   at /my-stories. Falls back to /my-stories (edit mode default)
  //   or /book/X/question/Y (book-create mode) or / (generic create).
  function returnPath() {
    // Book-context return takes precedence in any mode.
    if (fromBookId && fromQId) {
      return `/book/${encodeURIComponent(fromBookId)}/question/${encodeURIComponent(fromQId)}`;
    }
    if (fromBookId) {
      return `/book/${encodeURIComponent(fromBookId)}`;
    }
    if (isEdit) return '/my-stories';
    if (isBookMode) {
      return `/book/${encodeURIComponent(bookId)}/question/${encodeURIComponent(bookQId)}`;
    }
    return '/';
  }

  function handleFinish() {
    if (isEdit) {
      router.push(returnPath());
      return;
    }
    if (isBookMode) {
      // Book-create flow: linkErr means the import failed even though
      // the fragment saved — fall through to /my-stories so the user
      // can verify and re-link manually instead of bouncing into a
      // half-attached question page.
      if (linkErr) {
        router.push('/my-stories');
      } else {
        router.push(returnPath());
      }
      return;
    }
    router.push(returnPath() || '/my-stories');
  }

  function handleCancel() {
    router.push(returnPath());
  }

  if (!token) {
    return <div className={s.loading} />;
  }

  // In edit mode the form is editable from the start AND remains editable
  // after each save (re-save allowed). In create mode the form locks after
  // the first save so the user can't accidentally double-submit.
  const formDisabled = saving || (!isEdit && !!savedFragment);

  // Save button enabled rule: in edit mode allow re-save anytime the
  // required fields are present and we're not already mid-flight; in
  // create mode also require that we haven't saved yet.
  const canSave = !saving
    && title.trim().length > 0
    && content.trim().length > 0
    && (isEdit || !savedFragment);

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={handleCancel}>
          {m.backHome}
        </button>
        <h1 className={s.pageTitle}>
          {isEdit ? m.pageTitleEdit
            : isBookMode ? m.pageTitleBook
            : m.pageTitle}
        </h1>
      </header>

      {/* 🆕 Task 95 — edit-mode info banner. Tells the senior they can
          revise existing text AND append. Only shows when actually
          editing; new-fragment flows skip this entirely. */}
      {isEdit && !editLoadErr && (
        <div className={s.continueContextBox}>
          <div className={s.continueContextTitle}>{m.editInfoHint}</div>
        </div>
      )}
      {isEdit && editLoadErr && (
        <div className={s.warnBanner}>⚠️ {editLoadErr}</div>
      )}

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
          disabled={formDisabled}
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
          disabled={formDisabled}
          aria-label={m.subtitleLabel}
        />

        <label className={s.label}>{m.contentLabel}</label>
        <textarea
          className={s.textarea}
          value={content}
          maxLength={CONTENT_MAX}
          onChange={(e) => setContent(e.target.value)}
          placeholder={m.contentPlaceholder}
          disabled={formDisabled}
          aria-label={m.contentLabel}
          rows={14}
        />
        <div className={s.charCount}>
          {content.length.toLocaleString()} / {CONTENT_MAX.toLocaleString()} {m.charCountSuffix}
          {!isEdit && !savedFragment && (
            <span className={s.autosaveNote}> · {m.autosaveOff}</span>
          )}
        </div>

        {saveErr  && <div className={s.errBanner}>⚠️ {saveErr}</div>}
        {linkErr  && <div className={s.warnBanner}>⚠️ {linkErr}</div>}
        {editFlash && <div className={s.savedFlash}>{m.savedFlash}</div>}

        {/* ── Save / Finish actions ───────────────────────────── */}
        <div className={s.actions}>
          {isEdit ? (
            <>
              <button
                className={s.saveBtn}
                onClick={handleSave}
                disabled={!canSave || editLoading}
              >
                {saving ? m.savingBtn : m.saveEditBtn}
              </button>
              <button
                className={s.finishBtn}
                onClick={handleFinish}
                disabled={saving}
              >
                {m.finishEditBtn}
              </button>
            </>
          ) : !savedFragment ? (
            <>
              <button
                className={s.saveBtn}
                onClick={handleSave}
                disabled={!canSave}
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

        {/* ── Photos ─────────────────────────────────────────────
            Edit mode: uploader visible from the start (savedFragment
            populated by initial GET).
            Create mode: hint until first save, then uploader. */}
        <div className={s.photosSection}>
          <div className={s.photosLabel}>{m.photosLabel}</div>
          {savedFragment && (showPhotos || isEdit) ? (
            <PhotoUploader
              fragmentId={savedFragment.id}
              lang={langLower}
            />
          ) : (
            <div className={s.photosHint}>{m.photosHintCreate}</div>
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
