'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import PhotoUploader from '@/components/photos/PhotoUploader';
import FragmentModal from '@/components/fragments/FragmentModal';
import { VIS_MSGS } from '@/components/fragments/fragmentI18n';
import {
  getToken,
  authFetch,
  fmtDate,
  fmtDateShort,
  preview,
  Spinner,
} from '@/components/fragments/fragmentHelpers';
import s from './page.module.css';


function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}


// ── Status label helpers ────────────────────────────────────────
function getBookStatusInfo(status, vm) {
  const map = {
    pending   : { msg: vm.bookStatusPending,    cls: 'pendingMsg',   card: 'pending'   },
    generating: { msg: vm.bookStatusGenerating, cls: 'pendingMsg',   card: 'pending'   },
    review    : { msg: vm.bookStatusReview,     cls: 'reviewMsg',    card: 'review'    },
    completed : { msg: vm.bookStatusCompleted,  cls: 'completedMsg', card: 'completed' },
    published : { msg: vm.bookStatusCompleted,  cls: 'completedMsg', card: 'completed' },
  };
  return map[status] || map.pending;
}


// ── Ebook Request Modal ──────────────────────────────────────────
function EbookModal({ fragments, onClose, onSuccess, lang = 'KO' }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [title, setTitle]           = useState(vm.ebookTitleDefault);
  const [dedication, setDedication] = useState('');
  const [autoPreface, setAutoPreface]   = useState(true);
  const [autoEpilogue, setAutoEpilogue] = useState(true);
  const [selectedIds, setSelectedIds]   = useState(() =>
    new Set(fragments.map(f => f.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);

  function toggleFragment(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === fragments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(fragments.map(f => f.id)));
    }
  }

  async function handleSubmit() {
    if (!title.trim() || selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await authFetch('/api/books/request', {
        method: 'POST',
        body: JSON.stringify({
          title       : title.trim(),
          dedication  : dedication.trim() || null,
          autoPreface,
          autoEpilogue,
          fragmentIds : [...selectedIds],
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDone(true);
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const allSelected = selectedIds.size === fragments.length;

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />

        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{vm.ebookModalTitle}</div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalBody}>
          {done ? (
            <div className={s.successBox}>
              <div className={s.successIcon}>📖</div>
              <div className={s.successTitle}>{vm.ebookSuccessTitle}</div>
              <div className={s.successDesc} style={{ whiteSpace: 'pre-line' }}>
                {vm.ebookSuccessDesc}
              </div>
            </div>
          ) : (
            <>
              {/* Title */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>{vm.ebookTitleLabel}</label>
                <input
                  className={s.formInput}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={vm.ebookTitleDefault}
                />
              </div>

              {/* Dedication */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>{vm.ebookDedicationLabel}</label>
                <textarea
                  className={`${s.formInput} ${s.formTextarea}`}
                  value={dedication}
                  onChange={e => setDedication(e.target.value)}
                  placeholder={vm.ebookDedicationPlaceholder}
                />
              </div>

              {/* Options */}
              <div className={s.checkGroup}>
                <label className={s.checkLabel}>
                  <input type="checkbox" checked={autoPreface}
                    onChange={e => setAutoPreface(e.target.checked)} />
                  {vm.ebookOptionPreface}
                </label>
                <label className={s.checkLabel}>
                  <input type="checkbox" checked={autoEpilogue}
                    onChange={e => setAutoEpilogue(e.target.checked)} />
                  {vm.ebookOptionEpilogue}
                </label>
              </div>

              {/* Fragment selection */}
              <div className={s.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className={s.formLabel}>
                    {vm.ebookFragmentsLabel(selectedIds.size, fragments.length)}
                  </label>
                  <button
                    onClick={toggleAll}
                    style={{ background: 'none', border: 'none', fontSize: 12,
                      color: '#ea580c', cursor: 'pointer', fontWeight: 600 }}>
                    {allSelected ? vm.ebookDeselectAll : vm.ebookSelectAll}
                  </button>
                </div>
                <div className={s.fragmentPicker}>
                  {fragments.map(f => (
                    <div key={f.id} className={s.fragmentPickerItem}
                      onClick={() => toggleFragment(f.id)}>
                      <input type="checkbox" readOnly
                        checked={selectedIds.has(f.id)}
                        onChange={() => toggleFragment(f.id)} />
                      <span className={s.fragmentPickerName}>{f.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className={s.ctaBtn}
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || selectedIds.size === 0}>
                {submitting ? vm.ebookSubmitting : vm.ebookSubmit}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UserCollection components (2026-04-26 — Task 36)
// ═══════════════════════════════════════════════════════════════

function CollectionsView({ collections, onCreated, onChanged, lang, fragments }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [openCollectionId, setOpenCollectionId] = useState(null);

  return (
    <div className={s.collectionsContainer}>
      <button
        className={s.createCollectionBtn}
        onClick={() => setShowCreateModal(true)}
      >
        ➕ {vm.createCollection}
      </button>

      {collections.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>📚</div>
          <div className={s.emptyTitle}>{vm.noCollections}</div>
          <div className={s.emptyDesc}>{vm.noCollectionsHint}</div>
        </div>
      ) : (
        <div className={s.collectionsList}>
          {collections.map(c => (
            <button
              key={c.id}
              className={s.collectionCard}
              onClick={() => setOpenCollectionId(c.id)}
            >
              <div className={s.collectionTitle}>{c.name}</div>
              {c.description && (
                <div className={s.collectionDesc}>{c.description}</div>
              )}
              <div className={s.collectionMeta}>
                {vm.fragmentCountLabel(c.fragment_count || 0)} · {(c.total_word_count || 0).toLocaleString()}{vm.charsLabel}
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateCollectionModal
          lang={lang}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            onCreated();
          }}
        />
      )}

      {openCollectionId && (
        <CollectionDetailModal
          collectionId={openCollectionId}
          lang={lang}
          fragments={fragments}
          onClose={() => setOpenCollectionId(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function CreateCollectionModal({ lang, onClose, onCreated }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!name.trim()) {
      setError(vm.nameRequired);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await authFetch('/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || vm.createFailed);
      }
    } catch {
      setError(vm.createFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{vm.createCollection}</div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={s.modalBody}>
          <label className={s.formLabelCol}>{vm.nameLabel}</label>
          <input
            type="text"
            className={s.formInputCol}
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={200}
            placeholder={vm.namePlaceholder}
            autoFocus
          />

          <label className={s.formLabelCol}>{vm.descriptionLabel} ({vm.optional})</label>
          <textarea
            className={s.formTextareaCol}
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={5000}
            rows={3}
            placeholder={vm.descriptionPlaceholder}
          />

          {error && <div className={s.errorMsg}>{error}</div>}

          <div className={s.modalActions}>
            <button className={s.cancelBtn} onClick={onClose} disabled={saving}>
              {vm.cancelBtn}
            </button>
            <button
              className={s.btnPrimaryCol}
              onClick={handleSubmit}
              disabled={saving || !name.trim()}
            >
              {saving ? vm.saving : vm.create}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollectionDetailModal({ collectionId, lang, fragments, onClose, onChanged }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddFragmentModal, setShowAddFragmentModal] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/collections/${collectionId}`);
      if (res.ok) {
        const data = await res.json();
        setCollection(data.collection);
        setEditName(data.collection.name);
        setEditDescription(data.collection.description || '');
      }
    } catch (e) {
      console.error('[CollectionDetailModal load]', e.message);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!editName.trim()) {
      setError(vm.nameRequired);
      return;
    }
    setError('');
    try {
      const res = await authFetch(`/api/collections/${collectionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        await load();
        onChanged();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || vm.errMsg);
      }
    } catch {
      setError(vm.errMsg);
    }
  }

  async function handleDelete() {
    if (!window.confirm(vm.confirmDelete)) return;
    try {
      const res = await authFetch(`/api/collections/${collectionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onChanged();
        onClose();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRemoveFragment(fragmentId) {
    try {
      const res = await authFetch(
        `/api/collections/${collectionId}/fragments/${fragmentId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        await load();
        onChanged();
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (loading || !collection) {
    return (
      <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={s.modal}>
          <div className={s.modalHandle} />
          <div className={s.modalBody}><Spinner /></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={s.modal}>
          <div className={s.modalHandle} />
          <div className={s.modalHeader}>
            <div className={s.modalTitle}>
              {editing ? vm.editCollection : collection.name}
            </div>
            <button className={s.modalClose} onClick={onClose}>✕</button>
          </div>

          <div className={s.modalBody}>
            {editing ? (
              <>
                <label className={s.formLabelCol}>{vm.nameLabel}</label>
                <input
                  type="text"
                  className={s.formInputCol}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  maxLength={200}
                />
                <label className={s.formLabelCol}>{vm.descriptionLabel}</label>
                <textarea
                  className={s.formTextareaCol}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  maxLength={5000}
                  rows={3}
                  placeholder={vm.descriptionPlaceholder}
                />
                {error && <div className={s.errorMsg}>{error}</div>}
                <div className={s.modalActions}>
                  <button className={s.cancelBtn} onClick={() => { setEditing(false); setError(''); }}>
                    {vm.cancelBtn}
                  </button>
                  <button className={s.btnPrimaryCol} onClick={handleSave}>
                    {vm.saveBtn}
                  </button>
                </div>
              </>
            ) : (
              <>
                {collection.description && (
                  <p className={s.collectionDescFull}>{collection.description}</p>
                )}
                <div className={s.collectionMetaFull}>
                  {vm.fragmentCountLabel(collection.fragment_count || 0)} · {(collection.total_word_count || 0).toLocaleString()}{vm.charsLabel}
                </div>

                <button
                  className={s.addFragmentBtn}
                  onClick={() => setShowAddFragmentModal(true)}
                >
                  ➕ {vm.addFragmentBtn}
                </button>

                <div className={s.fragmentList}>
                  {collection.fragments.length === 0 ? (
                    <div className={s.emptyHint}>{vm.noFragmentsInCollection}</div>
                  ) : (
                    collection.fragments.map(f => (
                      <div key={f.id} className={s.fragmentRow}>
                        <div className={s.fragmentRowMain}>
                          <div className={s.fragmentRowTitle}>📄 {f.title}</div>
                          <div className={s.fragmentRowMeta}>
                            {(f.word_count || 0).toLocaleString()}{vm.charsLabel}
                            {f.continuation_count > 0 && ` · +${f.continuation_count}`}
                          </div>
                        </div>
                        <button
                          className={s.removeBtn}
                          onClick={() => handleRemoveFragment(f.id)}
                          title={vm.removeFromCollection}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {error && <div className={s.errorMsg}>{error}</div>}

                <div className={s.modalActions}>
                  <button className={s.btnDangerCol} onClick={handleDelete}>
                    {vm.deleteCollection}
                  </button>
                  <button className={s.cancelBtn} onClick={() => setEditing(true)}>
                    {vm.editCollection}
                  </button>
                  <button className={s.btnPrimaryCol} onClick={onClose}>
                    {vm.closeBtn}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showAddFragmentModal && (
        <AddFragmentToCollectionModal
          collectionId={collectionId}
          allFragments={fragments}
          existingFragmentIds={collection.fragments.map(f => f.id)}
          lang={lang}
          onClose={() => setShowAddFragmentModal(false)}
          onAdded={async () => {
            await load();
            onChanged();
          }}
        />
      )}
    </>
  );
}

function AddFragmentToCollectionModal({ collectionId, allFragments, existingFragmentIds, lang, onClose, onAdded }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [adding, setAdding] = useState(null);

  // Only root fragments (parent_fragment_id IS NULL) can be added
  const rootFragments = (allFragments || []).filter(f => !f.parent_fragment_id);
  const available = rootFragments.filter(f => !existingFragmentIds.includes(f.id));

  async function handleAdd(fragmentId) {
    setAdding(fragmentId);
    try {
      const res = await authFetch(`/api/collections/${collectionId}/fragments`, {
        method: 'POST',
        body: JSON.stringify({ fragmentId }),
      });
      if (res.ok || res.status === 409) {
        await onAdded();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{vm.selectFragmentsTitle}</div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={s.modalBody}>
          {available.length === 0 ? (
            <div className={s.emptyHint}>{vm.allFragmentsAdded}</div>
          ) : (
            <div className={s.fragmentSelectList}>
              {available.map(f => (
                <button
                  key={f.id}
                  className={s.fragmentSelectRow}
                  onClick={() => handleAdd(f.id)}
                  disabled={adding === f.id}
                >
                  <div className={s.fragmentSelectMain}>
                    <div className={s.fragmentSelectTitle}>📄 {f.title}</div>
                    <div className={s.fragmentSelectMeta}>
                      {(f.word_count || 0).toLocaleString()}{vm.charsLabel}
                    </div>
                  </div>
                  <div className={s.addIndicator}>
                    {adding === f.id ? '…' : '➕'}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className={s.modalActions}>
            <button className={s.btnPrimaryCol} onClick={onClose}>
              {vm.doneBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Main Page ────────────────────────────────────────────────────
export default function MyStoriesPage() {
  const router = useRouter();
  const lang   = useLang();

  const [fragments, setFragments]   = useState([]);
  const [books, setBooks]           = useState([]);
  const [collections, setCollections] = useState([]);
  const [activeTab, setActiveTab]   = useState('stories');  // 'stories' | 'collections'
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);   // fragment for detail modal
  const [showEbook, setShowEbook]   = useState(false);
  const [toast, setToast]           = useState('');
  const toastTimer = useRef(null);
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  // ── Data loading ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    const token = getToken();
    if (!token) {
      // 🔥 Task 74 — stash redirect for the post-login bounce.
      try { sessionStorage.setItem('postLoginRedirect', '/my-stories'); } catch {}
      router.replace('/login');
      return;
    }

    setLoading(true);
    try {
      const [fragRes, bookRes, colRes] = await Promise.all([
        authFetch('/api/fragments?status=draft,confirmed&limit=100'),
        authFetch('/api/books/status'),
        authFetch('/api/collections'),
      ]);

      if (fragRes.status === 401 || bookRes.status === 401) {
        try { sessionStorage.setItem('postLoginRedirect', '/my-stories'); } catch {}
        router.replace('/login');
        return;
      }

      const fragData = await fragRes.json();
      const bookData = await bookRes.json();
      const colData  = colRes.ok ? await colRes.json() : { collections: [] };

      setFragments(fragData.fragments || []);
      setBooks(bookData.books || []);
      setCollections(colData.collections || []);
    } catch (e) {
      console.error(e);
      showToast(vm.toastLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Lightweight refresh for collections only (after create/edit/delete/add/remove)
  const reloadCollections = useCallback(async () => {
    try {
      const res = await authFetch('/api/collections');
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections || []);
      }
    } catch (e) {
      console.error('[reloadCollections]', e.message);
    }
  }, []);

  // ── Callbacks ────────────────────────────────────────────────
  function handleUpdated(updated) {
    setFragments(prev => prev.map(f => f.id === updated.id ? updated : f));
    if (selected?.id === updated.id) setSelected(updated);
    showToast(vm.toastSaved);
  }

  function handleDeleted(id) {
    setFragments(prev => prev.filter(f => f.id !== id));
    setSelected(null);
    showToast(vm.toastDeleted);
  }

  // 🔥 Photos-only update path (Tim re-report). Updates the card
  //   thumbnail list WITHOUT touching `selected`, so a photo upload /
  //   delete inside the open modal never re-renders the modal sheet
  //   and never hijacks the back-button click.
  function handlePhotosChanged(fragmentId, photos) {
    setFragments(prev => prev.map(f => (f.id === fragmentId ? { ...f, photos } : f)));
  }

  function handleEbookSuccess() {
    // Refresh books after a moment
    setTimeout(loadAll, 1200);
  }

  // ── Stats ────────────────────────────────────────────────────
  const totalChars = fragments.reduce((sum, f) => sum + (f.word_count || f.content?.length || 0), 0);
  const lastCreated = fragments.length > 0
    ? fmtDateShort(fragments.reduce((latest, f) =>
        f.created_at > latest ? f.created_at : latest, fragments[0].created_at))
    : '—';

  // ── Render ───────────────────────────────────────────────────
  const confirmedFragments = fragments.filter(f => f.status === 'confirmed');
  const draftFragments     = fragments.filter(f => f.status === 'draft');

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <button className={s.backBtn} onClick={() => router.back()}>‹</button>
          <span className={s.pageTitle}>{vm.pageTitle}</span>
        </div>
        <button className={s.refreshBtn} onClick={loadAll} title={vm.refreshTitle}>↻</button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* ── Tab Bar (2026-04-26 — Task 36) ── */}
          <div className={s.tabBar}>
            <button
              className={`${s.tab} ${activeTab === 'stories' ? s.tabActive : ''}`}
              onClick={() => setActiveTab('stories')}
            >
              {vm.tabStories} ({fragments.length})
            </button>
            <button
              className={`${s.tab} ${activeTab === 'collections' ? s.tabActive : ''}`}
              onClick={() => setActiveTab('collections')}
            >
              {vm.tabCollections} ({collections.length})
            </button>
          </div>

          {activeTab === 'collections' ? (
            <CollectionsView
              collections={collections}
              onCreated={reloadCollections}
              onChanged={reloadCollections}
              lang={lang}
              fragments={fragments}
            />
          ) : (
          <>
          {/* ── Stats Bar ── */}
          <div className={s.statsBar}>
            <div className={s.statItem}>
              <div className={s.statValue}>{fragments.length}</div>
              <div className={s.statLabel}>{vm.statLabelStories}</div>
            </div>
            <div className={s.statItem}>
              <div className={s.statValue}>
                {totalChars >= 1000 ? `${(totalChars / 1000).toFixed(1)}k` : totalChars}
              </div>
              <div className={s.statLabel}>{vm.statLabelChars}</div>
            </div>
            <div className={s.statItem}>
              <div className={s.statValue} style={{ fontSize: 14 }}>{lastCreated}</div>
              <div className={s.statLabel}>{vm.statLabelLatest}</div>
            </div>
          </div>

          {/* ── Confirmed Fragments ── */}
          {confirmedFragments.length > 0 && (
            <>
              <div className={s.sectionTitle}>{vm.sectionConfirmed}</div>
              <div className={s.cardList}>
                {confirmedFragments.map(f => (
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} lang={lang} />
                ))}
              </div>
            </>
          )}

          {/* ── Draft Fragments ── */}
          {draftFragments.length > 0 && (
            <>
              <div className={s.sectionTitle}>{vm.sectionDraft}</div>
              <div className={s.cardList}>
                {draftFragments.map(f => (
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} lang={lang} />
                ))}
              </div>
            </>
          )}

          {/* ── Empty State ── */}
          {fragments.length === 0 && (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>📝</div>
              <div className={s.emptyTitle}>{vm.emptyTitleStories}</div>
              <div className={s.emptyDesc} style={{ whiteSpace: 'pre-line' }}>
                {vm.emptyDescStories}
              </div>
            </div>
          )}

          {/* ── Ebook Section ── */}
          <div className={s.ebookSection}>
            <div className={s.ebookSectionTitle}>{vm.ebookSectionTitle}</div>
            <div className={s.ebookSectionDesc}>{vm.ebookSectionDesc}</div>

            {/* Existing books */}
            {books.length > 0 && (
              <div className={s.ebookStatusList}>
                {books.map(book => {
                  const info = getBookStatusInfo(book.status, vm);
                  return (
                    <div key={book.id} className={`${s.ebookStatusCard} ${s[info.card]}`}>
                      <div className={s.ebookStatusTitle}>{book.title}</div>
                      <div className={`${s.ebookStatusMsg} ${s[info.cls]}`}>{info.msg}</div>
                      {(book.status === 'completed' || book.status === 'published') && book.has_output && (
                        <button className={s.downloadBtn}
                          onClick={() => handleDownload(book.id, book.title, vm)}>
                          {vm.ebookDownload}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className={s.ctaBtn}
              onClick={() => setShowEbook(true)}
              disabled={fragments.length === 0}>
              {fragments.length === 0 ? vm.ebookRequestEmpty : vm.ebookRequestBtn}
            </button>
          </div>
          </>
          )}
        </>
      )}

      {/* ── Fragment Detail Modal ── */}
      {selected && (
        <FragmentModal
          fragment={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onPhotosChanged={handlePhotosChanged}
          onDeleted={handleDeleted}
          lang={lang}
        />
      )}

      {/* ── Ebook Request Modal ── */}
      {showEbook && (
        <EbookModal
          fragments={fragments}
          lang={lang}
          onClose={() => setShowEbook(false)}
          onSuccess={handleEbookSuccess}
        />
      )}

      {/* ── Toast ── */}
      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}

// ── Fragment Card ────────────────────────────────────────────────
function FragmentCard({ fragment: f, onClick, lang = 'KO' }) {
  const router = useRouter();
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  // 🔥 Task 53 #2: Tim's first beta scan of /my-stories felt cluttered —
  //    every card showed a status badge ("초안") plus 3–4 colored tag
  //    chips (theme/emotion/people) that read as noise to a senior eye.
  //    The card now keeps only the signals that help the user FIND a
  //    story they recognise: title, subtitle, preview, date, and the
  //    privacy badge. Status + tags moved out of the card surface (they
  //    still live in the detail modal).

  function handleRegenerate(e) {
    e.stopPropagation();
    router.push(`/chat?topic=${encodeURIComponent(f.title)}&fromFragment=${f.id}`);
  }

  return (
    <div className={s.card} onClick={onClick}>
      <div className={s.cardHeader}>
        <div className={s.cardTitle}>
          {f.truncated && <span className={s.truncatedIcon} title={vm.truncatedTitle}>⚠️</span>}
          {f.title}
        </div>
        <div className={s.cardHeaderBadges}>
          <span className={(f.visibility === 'public') ? s.visibilityBadgePublic : s.visibilityBadgePrivate}>
            {(f.visibility === 'public') ? vm.publicBadge : vm.privateBadge}
          </span>
        </div>
      </div>

      {f.subtitle && <div className={s.cardSubtitle}>{f.subtitle}</div>}

      <div className={s.cardPreview}>{preview(f.content, 100)}</div>

      {/* 🔥 Task 75 — photo thumbnails (max 2) right under the preview
          so the user recognizes a story by its picture, not just text. */}
      {Array.isArray(f.photos) && f.photos.length > 0 && (
        <div className={s.cardPhotos}>
          {f.photos.slice(0, 2).map(p => (
            <img key={p.id} src={p.blob_url} alt="" className={s.cardThumb} />
          ))}
        </div>
      )}

      <div className={s.cardFooter}>
        <span className={s.cardDate}>{fmtDateShort(f.created_at)}</span>
        {/* 🆕 Stage 7 — fragments saved as a book question answer get a
            small purple "책에 포함됨" pill so the senior can tell at a
            glance which entries are wired into a book vs free-form. */}
        {f.book_id && (
          <span className={s.bookBadge}>📚 책에 포함됨</span>
        )}
      </div>

      {f.truncated && (
        <div className={s.truncatedBanner}>
          <div className={s.truncatedBannerText}>{vm.truncatedShort}</div>
          <button className={s.regenerateBtn} onClick={handleRegenerate}>
            {vm.continueWithEmma}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Download helper ──────────────────────────────────────────────
async function handleDownload(bookId, title, vm) {
  const token = getToken();
  try {
    const res = await fetch(`/api/books/download/${bookId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) { alert(vm?.ebookDownloadFailed || 'Download failed.'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${title || 'ebook'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert(vm?.ebookDownloadError || 'An error occurred while downloading.');
  }
}
