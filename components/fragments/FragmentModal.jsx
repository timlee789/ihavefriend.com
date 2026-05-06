'use client';

/**
 * components/fragments/FragmentModal.jsx  (Task 82)
 *
 * The REAL FragmentModal — extracted verbatim from /my-stories/page.jsx
 * so /my-stories and /book/.../question/[qId] share one identical
 * surface (Tim's second-pass requirement: lean modal from Task 79
 * was the wrong call).
 *
 * Capabilities:
 *   • View body (markdown), photos, continuations thread
 *   • Edit title / subtitle / content
 *   • Visibility toggle (private ↔ public) with confirm
 *   • Delete with confirm
 *   • Add to / remove from collections
 *   • Truncated banner → continue-with-Emma path
 *   • PhotoUploader (max 2 photos)
 *   • Continue thread → /chat?continueFragment=<id>
 *
 * Lang: KO / EN / ES uppercase strings (matches the rest of the
 * /my-stories codebase). Book pages must convert their lowercase
 * lang before passing it in.
 *
 * CSS: imports /my-stories/page.module.css. Same scoped classes
 * regardless of which page renders this; book pages don't need to
 * own duplicate CSS.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import QRCode from 'qrcode';
import PhotoUploader from '@/components/photos/PhotoUploader';
import FragmentCollectionPicker from './FragmentCollectionPicker';
import { VIS_MSGS } from './fragmentI18n';
import { authFetch } from './fragmentHelpers';
import s from '@/app/my-stories/page.module.css';

export default function FragmentModal({
  fragment,
  onClose,
  onUpdated,
  onPhotosChanged,
  onDeleted,
  lang = 'KO',
  // 🔥 Task 83 — render the modal body inside the page flow instead
  //   of as an overlay. Used by /book/.../question/[qId] so the answer
  //   appears right where the old preview card sat (no extra tap).
  //   When inline=true: no overlay/backdrop, no slide-up animation,
  //   no back/close/handle controls — just the content. All edit /
  //   delete / photo / continuation behavior is otherwise identical.
  inline = false,
  // 🔥 Task 96 — surface the "where did the user come from" context
  //   so the typed-edit page can route them back. Shape:
  //     { bookId, questionId } → /book/X/question/Y is the return
  //     { bookId }             → /book/X is the return (rare, future use)
  //     null                   → /my-stories is the return (default)
  //   Only the question page passes this; /my-stories leaves it null
  //   so the existing "back to /my-stories" behavior keeps working.
  bookContext = null,
}) {
  const router = useRouter();
  const [mode, setMode]           = useState('view');  // 'view' | 'edit' | 'confirmDelete' | 'confirmVisibility'
  const [editTitle, setEditTitle] = useState(fragment.title || '');
  const [editSubtitle, setEditSub] = useState(fragment.subtitle || '');
  const [editContent, setEditCont] = useState(fragment.content || '');
  const [saving, setSaving]       = useState(false);
  const [currentVis, setCurrentVis] = useState(fragment.visibility || 'private');
  const [continuations, setContinuations] = useState(fragment.continuations || []);
  const [fragmentCollections, setFragmentCollections] = useState(fragment.collections || []);
  const [showPicker, setShowPicker] = useState(false);

  // 🆕 Step 08 (Voice QR) — audio state
  const [audio, setAudio] = useState(null);          // FragmentAudio row | null | 'loading'
  const [audioBusy, setAudioBusy] = useState(false); // toggle / delete in flight
  const [qrDataUrl, setQrDataUrl] = useState('');    // base64 PNG of QR
  const [linkCopied, setLinkCopied] = useState(false);
  const [confirmDeleteAudio, setConfirmDeleteAudio] = useState(false);

  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;

  const reloadFragmentMeta = useCallback(async () => {
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}`);
      const data = await res.json();
      if (data?.fragment) {
        if (data.fragment.continuations) setContinuations(data.fragment.continuations);
        if (data.fragment.collections) setFragmentCollections(data.fragment.collections);
      }
    } catch (e) {
      console.warn('[FragmentModal] meta load failed:', e.message);
    }
  }, [fragment.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/fragments/${fragment.id}`);
        const data = await res.json();
        if (!cancelled && data?.fragment) {
          if (data.fragment.continuations) setContinuations(data.fragment.continuations);
          if (data.fragment.collections) setFragmentCollections(data.fragment.collections);
        }
      } catch (e) {
        console.warn('[FragmentModal] continuations load failed:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [fragment.id]);

  // 🆕 Step 08 (Voice QR) — load audio metadata
  useEffect(() => {
    let cancelled = false;
    setAudio('loading');
    (async () => {
      try {
        const res = await authFetch(`/api/fragments/${fragment.id}/audio`);
        if (!res.ok) {
          if (!cancelled) setAudio(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setAudio(data?.audio || null);
      } catch (e) {
        console.warn('[FragmentModal] audio load failed:', e.message);
        if (!cancelled) setAudio(null);
      }
    })();
    return () => { cancelled = true; };
  }, [fragment.id]);

  // 🆕 Step 08 (Voice QR) — generate QR data URL when audio + is_public
  useEffect(() => {
    if (!audio || audio === 'loading' || !audio.is_public || !audio.public_token) {
      setQrDataUrl('');
      return;
    }
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/listen/${audio.public_token}`
      : `/listen/${audio.public_token}`;
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    })
      .then(dataUrl => { if (!cancelled) setQrDataUrl(dataUrl); })
      .catch(e => {
        console.warn('[FragmentModal] QR generation failed:', e.message);
        if (!cancelled) setQrDataUrl('');
      });
    return () => { cancelled = true; };
  }, [audio]);

  const allTags = [
    ...(fragment.tags_theme   || []).map(t => ({ text: t, cls: s.tagTheme })),
    ...(fragment.tags_emotion || []).map(t => ({ text: t, cls: s.tagEmotion })),
    ...(fragment.tags_people  || []).map(t => ({ text: t, cls: s.tagPeople })),
    ...(fragment.tags_era     || []).map(t => ({ text: t, cls: s.tag })),
    ...(fragment.tags_place   || []).map(t => ({ text: t, cls: s.tag })),
  ];

  async function handleSave() {
    if (!editTitle.trim() || !editContent.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitle, subtitle: editSubtitle, content: editContent }),
      });
      const data = await res.json();
      if (data.fragment) { onUpdated && onUpdated(data.fragment); setMode('view'); }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await authFetch(`/api/fragments/${fragment.id}`, { method: 'DELETE' });
      onDeleted && onDeleted(fragment.id);
    } finally {
      setSaving(false);
    }
  }

  // 🆕 Step 08 (Voice QR) — audio handlers
  async function handleToggleAudioShare() {
    if (!audio || audio === 'loading') return;
    setAudioBusy(true);
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}/audio`, {
        method: 'PATCH',
        body: JSON.stringify({ is_public: !audio.is_public }),
      });
      const data = await res.json();
      if (data?.audio) {
        setAudio(data.audio);
      } else {
        alert(vm.errMsg);
      }
    } catch (e) {
      console.warn('[FragmentModal] audio share toggle failed:', e.message);
      alert(vm.errMsg);
    } finally {
      setAudioBusy(false);
    }
  }

  async function handleDeleteAudio() {
    if (!audio || audio === 'loading') return;
    setAudioBusy(true);
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}/audio`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAudio(null);
        setConfirmDeleteAudio(false);
      } else {
        alert(vm.errMsg);
      }
    } catch (e) {
      console.warn('[FragmentModal] audio delete failed:', e.message);
      alert(vm.errMsg);
    } finally {
      setAudioBusy(false);
    }
  }

  function handleCopyAudioLink() {
    if (!audio?.public_token || typeof window === 'undefined') return;
    const url = `${window.location.origin}/listen/${audio.public_token}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      },
      () => alert(vm.errMsg)
    );
  }

  async function handleToggleVisibility() {
    const newVis = currentVis === 'public' ? 'private' : 'public';
    setSaving(true);
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ visibility: newVis }),
      });
      const data = await res.json();
      if (data.fragment) {
        setCurrentVis(data.fragment.visibility);
        onUpdated && onUpdated(data.fragment);
        setMode('view');
      } else {
        alert(vm.errMsg);
      }
    } catch {
      alert(vm.errMsg);
    } finally {
      setSaving(false);
    }
  }

  const headerSection = (
    <div className={s.modalHeader}>
      {!inline && (
        <button className={s.modalBackBtn} onClick={onClose}>
          {vm.backToList}
        </button>
      )}
      <div className={s.modalHeaderText}>
        <div className={s.modalTitle}>
          {mode === 'edit' ? vm.editMode : fragment.title}
        </div>
        {mode === 'view' && fragment.subtitle && (
          <div className={s.modalSubtitle}>{fragment.subtitle}</div>
        )}
      </div>
    </div>
  );

  const bodyContent = (
    <div className={s.modalBody}>
          {/* ── VIEW MODE ── */}
          {mode === 'view' && (
            <>
              <div className={s.modalVisibilityRow}>
                <span className={(currentVis === 'public') ? s.visibilityBadgePublicLg : s.visibilityBadgePrivateLg}>
                  {(currentVis === 'public') ? vm.publicBadge : vm.privateBadge}
                </span>
              </div>

              {/* 🆕 Task 95 — voice continuation + unified edit/append.
                  Voice still creates a child fragment via the Gemini
                  Live path (/chat?continueFragment=…). The "글 수정 /
                  이어쓰기" button now opens /write?fragmentId=… in EDIT
                  mode — the senior can revise existing words and append
                  new ones in the same surface (Tim's mental model:
                  "이어글쓰기'와 '페이지 수정'이 같아야 합니다").
                  🔥 Task 96 — when the modal is rendered from a book
                  question page (bookContext set), append fromBookId /
                  fromQuestionId so /write can route the user back to
                  the same question page on Cancel / Finish.
                  🔥 Task 97 — auto-fallback to fragment.book_id /
                  fragment.book_question_id when bookContext is absent.
                  Fixes Tim's "/my-stories → 책 fragment 글 수정 → 무한
                  루프" bug: a book-attached fragment now routes back
                  to its book regardless of where the modal was opened
                  from. Free-form fragments still default to /my-stories
                  because their book_id is NULL. */}
              <div className={s.continueRow}>
                <button
                  className={s.continueBtn}
                  onClick={() => router.push(`/chat?continueFragment=${fragment.id}`)}
                >
                  {vm.continueLabel}
                </button>
                <button
                  className={s.continueByWritingBtn}
                  onClick={() => {
                    const params = new URLSearchParams({ fragmentId: fragment.id });
                    const returnBookId =
                      bookContext?.bookId || fragment.book_id || null;
                    const returnQuestionId =
                      bookContext?.questionId || fragment.book_question_id || null;
                    if (returnBookId)     params.set('fromBookId',     returnBookId);
                    if (returnQuestionId) params.set('fromQuestionId', returnQuestionId);
                    router.push(`/write?${params.toString()}`);
                  }}
                >
                  {vm.continueByWritingLabel}
                </button>
              </div>
              <div className={s.continueHint}>{vm.continueHint}</div>

              <div className={s.modalContent}>
                <ReactMarkdown>{fragment.content || ''}</ReactMarkdown>
              </div>

              {/* Photos (max 2) */}
              <div className={s.photosSection}>
                <div className={s.photosLabel}>
                  {lang === 'EN' ? '📷 Photos' : lang === 'ES' ? '📷 Fotos' : '📷 사진'}
                </div>
                <PhotoUploader
                  fragmentId={fragment.id}
                  lang={String(lang).toLowerCase()}
                  onChange={(photos) => onPhotosChanged && onPhotosChanged(fragment.id, photos)}
                />
              </div>

              {/* 🆕 Step 08 (Voice QR) — audio section */}
              <div className={s.audioSection} style={{ marginTop: 16, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className={s.audioSectionLabel} style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  {vm.audioSectionLabel}
                </div>

                {audio === 'loading' && (
                  <div style={{ fontSize: 13, opacity: 0.6, padding: 8 }}>
                    {vm.loading || '…'}
                  </div>
                )}

                {audio === null && (
                  <div style={{ fontSize: 13, opacity: 0.6, padding: 8 }}>
                    {vm.audioNoAudio}
                  </div>
                )}

                {audio && audio !== 'loading' && (
                  <>
                    {/* Audio player */}
                    <audio
                      src={audio.r2_url}
                      controls
                      preload="metadata"
                      style={{ width: '100%', marginBottom: 8 }}
                    />

                    {/* Metadata */}
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
                      <span>{vm.audioDuration(audio.duration_sec || 0)}</span>
                      {audio.play_count > 0 && (
                        <span>{vm.audioPlayCount(audio.play_count)}</span>
                      )}
                    </div>

                    {/* Share toggle */}
                    <div style={{ marginBottom: 12 }}>
                      <button
                        onClick={handleToggleAudioShare}
                        disabled={audioBusy}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: 'none',
                          background: audio.is_public ? 'rgba(34,197,94,0.18)' : 'rgba(168,85,247,0.18)',
                          color: 'currentColor',
                          fontSize: 14,
                          fontWeight: 500,
                          cursor: audioBusy ? 'wait' : 'pointer',
                          opacity: audioBusy ? 0.6 : 1,
                        }}
                      >
                        {audio.is_public ? vm.audioShareToggleOn : vm.audioShareToggleOff}
                      </button>
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, lineHeight: 1.4 }}>
                        {audio.is_public ? vm.audioShareDesc : vm.audioShareDescOff}
                      </div>
                    </div>

                    {/* QR code (only when public + token + qr generated) */}
                    {audio.is_public && qrDataUrl && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 12, background: '#fff', borderRadius: 8, marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 500 }}>
                          {vm.audioQrLabel}
                        </div>
                        <img src={qrDataUrl} alt="QR code" style={{ width: 200, height: 200 }} />
                        <button
                          onClick={handleCopyAudioLink}
                          style={{
                            marginTop: 8,
                            padding: '6px 12px',
                            border: '1px solid #ddd',
                            borderRadius: 6,
                            background: '#f5f5f5',
                            color: '#333',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {linkCopied ? vm.audioLinkCopied : vm.audioCopyLink}
                        </button>
                      </div>
                    )}

                    {/* Delete audio (rare action, less prominent) */}
                    {!confirmDeleteAudio ? (
                      <button
                        onClick={() => setConfirmDeleteAudio(true)}
                        style={{
                          fontSize: 12,
                          padding: '6px 10px',
                          background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: 6,
                          color: 'rgba(239,68,68,0.85)',
                          cursor: 'pointer',
                        }}
                      >
                        {vm.audioDelete}
                      </button>
                    ) : (
                      <div style={{ padding: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                        <div style={{ fontSize: 13, marginBottom: 8 }}>
                          {vm.audioDeleteConfirm}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={handleDeleteAudio}
                            disabled={audioBusy}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(239,68,68,0.85)',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: 'pointer',
                              opacity: audioBusy ? 0.6 : 1,
                            }}
                          >
                            {audioBusy ? vm.audioDeleting : vm.audioDeleteConfirmYes}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteAudio(false)}
                            style={{
                              padding: '6px 12px',
                              background: 'transparent',
                              border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: 'pointer',
                              color: 'currentColor',
                            }}
                          >
                            {vm.cancelBtn}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {fragment.truncated && (
                <div className={s.truncatedBanner}>
                  <div className={s.truncatedBannerText}>
                    {vm.truncatedBannerText}
                  </div>
                  <button
                    className={s.regenerateBtn}
                    onClick={() => {
                      router.push(`/chat?topic=${encodeURIComponent(fragment.title)}&fromFragment=${fragment.id}`);
                    }}
                  >
                    {vm.continueWithEmma}
                  </button>
                </div>
              )}

              {/* Continuation thread (children of this fragment) */}
              {continuations.length > 0 && (
                <div className={s.threadSection}>
                  <div className={s.threadTitle}>{vm.threadTitle}</div>
                  {continuations.map((c, i) => (
                    <div key={c.id} className={s.threadItem}>
                      <div className={s.threadOrder}>#{c.thread_order ?? i + 1}</div>
                      <div className={s.threadContent}>
                        <ReactMarkdown>{c.content || ''}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tag chips suppressed (Task 76 #4); JSX kept for one-line revival */}
              {false && allTags.length > 0 && (
                <div className={s.modalTagSection}>
                  <div className={s.modalTagLabel}>{vm.tagsLabel}</div>
                  <div className={s.tagRow}>
                    {allTags.map((t, i) => (
                      <span key={i} className={`${s.tag} ${t.cls}`}>{t.text}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Collections (root fragments only — continuations follow parent) */}
              {!fragment.parent_fragment_id && (
                <div className={s.fragmentCollectionsSection}>
                  <div className={s.collectionsLabel}>{vm.inCollectionsLabel}</div>
                  {fragmentCollections.length > 0 ? (
                    <div className={s.collectionTags}>
                      {fragmentCollections.map(c => (
                        <span key={c.id} className={s.collectionTag}>📚 {c.name}</span>
                      ))}
                    </div>
                  ) : (
                    <div className={s.noCollections}>{vm.noCollectionsForFragment}</div>
                  )}
                  <button
                    className={s.addToCollectionBtn}
                    onClick={() => setShowPicker(true)}
                  >
                    📚 {vm.addToCollectionBtn}
                  </button>
                </div>
              )}

              {/* 🆕 Task 95 — the inline Edit button is removed. The
                  "✏️ 글 수정 / 이어쓰기" button at the top of the modal
                  now serves as the single entry point for editing,
                  routed to /write?fragmentId=… so the senior gets the
                  full senior-friendly editor (large textarea, photos
                  immediately available, edit-with-append in one place).
                  The inline edit JSX further down is left intact for
                  back-compat / testing but the trigger is gone. */}
              <div className={s.modalActions}>
                <button className={s.visibilityBtn} onClick={() => setMode('confirmVisibility')}>
                  {currentVis === 'private' ? vm.toggleToPublic : vm.toggleToPrivate}
                </button>
                <button className={s.deleteBtn} onClick={() => setMode('confirmDelete')}>{vm.deleteFragment}</button>
              </div>
            </>
          )}

          {/* ── CONFIRM VISIBILITY CHANGE ── */}
          {mode === 'confirmVisibility' && (() => {
            const toPublic = currentVis === 'private';
            const bullets  = toPublic ? vm.bulletsToPub : vm.bulletsToPri;
            return (
              <>
                <div className={s.confirmTitle}>
                  {toPublic ? vm.confirmTitleToPub : vm.confirmTitleToPri}
                </div>
                <div className={s.confirmBody}>
                  {toPublic ? vm.confirmIntroToPub : vm.confirmIntroToPri}
                  <ul className={s.confirmList}>
                    {bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
                <div className={s.confirmRow}>
                  <button className={s.cancelBtn} onClick={() => setMode('view')}>{vm.cancelBtn}</button>
                  <button
                    className={s.visibilityBtn}
                    onClick={handleToggleVisibility}
                    disabled={saving}
                    style={{ flex: 1 }}
                  >
                    {saving ? vm.saving : (toPublic ? vm.confirmToPubBtn : vm.confirmToPriBtn)}
                  </button>
                </div>
              </>
            );
          })()}

          {/* ── CONFIRM DELETE ── */}
          {mode === 'confirmDelete' && (
            <>
              <div className={s.confirmMsg}>{vm.confirmDeleteFragment}</div>
              <div className={s.confirmRow}>
                <button className={s.deleteBtn} onClick={handleDelete} disabled={saving}
                  style={{ flex: 1 }}>
                  {saving ? vm.deletingMsg : vm.confirmDeleteYes}
                </button>
                <button className={s.cancelBtn} onClick={() => setMode('view')}>{vm.cancelBtn}</button>
              </div>
            </>
          )}

          {/* ── EDIT MODE ── */}
          {mode === 'edit' && (
            <>
              <input
                className={s.editInput}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder={vm.editTitlePlaceholder}
              />
              <input
                className={s.editInput}
                value={editSubtitle}
                onChange={e => setEditSub(e.target.value)}
                placeholder={vm.editSubtitlePlaceholder}
              />
              <textarea
                className={s.editArea}
                value={editContent}
                onChange={e => setEditCont(e.target.value)}
                placeholder={vm.editContentPlaceholder}
              />
              <div className={s.modalActions}>
                <button className={s.saveBtn} onClick={handleSave}
                  disabled={saving || !editTitle.trim() || !editContent.trim()}>
                  {saving ? vm.savingMsg : vm.saveBtn}
                </button>
                <button className={s.cancelBtn} onClick={() => setMode('view')}>{vm.cancelBtn}</button>
              </div>
            </>
          )}
    </div>
  );

  const picker = showPicker && (
    <FragmentCollectionPicker
      fragmentId={fragment.id}
      currentCollectionIds={fragmentCollections.map(c => c.id)}
      lang={lang}
      onClose={() => setShowPicker(false)}
      onChanged={reloadFragmentMeta}
    />
  );

  if (inline) {
    return (
      <>
        <div className={s.inlineContainer}>
          <div className={s.inlineBody}>
            {headerSection}
            {bodyContent}
          </div>
        </div>
        {picker}
      </>
    );
  }

  return (
    <>
      <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={s.modal}>
          <div className={s.modalHandle} />
          {headerSection}
          {bodyContent}
        </div>
      </div>
      {picker}
    </>
  );
}
