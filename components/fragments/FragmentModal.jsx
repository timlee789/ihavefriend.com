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

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
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

              <button
                className={s.continueBtn}
                onClick={() => router.push(`/chat?continueFragment=${fragment.id}`)}
              >
                {vm.continueLabel}
              </button>
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

              <div className={s.modalActions}>
                <button className={s.editBtn} onClick={() => setMode('edit')}>{vm.editMode}</button>
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
