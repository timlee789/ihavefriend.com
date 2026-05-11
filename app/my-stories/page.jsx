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
// 목차 (Table of Contents) — 2026-05-09 Sprint 1
//
// REWRITTEN from the original modal-based CollectionDetailModal
// pattern to match /book/[bookId]/customize's inline-expand
// chapterBlock pattern. One unified UX: ▶/▼ toggle, inline ✏️/🗑️
// actions, fragment list inside expanded block, "+ chapter" CTA at
// page bottom. Same mental model whether the senior is shaping a
// memoir or a free-story book.
//
// Data structure unchanged (Path A) — collections + fragments rows
// stay exactly as they are. Only the visual + interaction layer
// flipped to inline expand.
// ═══════════════════════════════════════════════════════════════

function CollectionsView({ collections, onCreated, onChanged, lang, fragments }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [expanded, setExpanded] = useState({});           // { [collectionId]: bool }
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCol, setEditingCol] = useState(null);     // collection row being edited
  const [confirmDel, setConfirmDel] = useState(null);     // { id, name }
  const [addingFragmentTo, setAddingFragmentTo] = useState(null); // collection id

  // Per-collection fragment cache so an open block doesn't refetch
  // on every parent re-render. Keyed by collection id, value is
  // the array of fragment rows (or null = loading, undefined = not
  // yet fetched).
  const [fragmentsByCol, setFragmentsByCol] = useState({});

  const loadFragments = useCallback(async (colId) => {
    setFragmentsByCol(prev => ({ ...prev, [colId]: null }));
    try {
      const res = await authFetch(`/api/collections/${colId}`);
      if (res.ok) {
        const data = await res.json();
        setFragmentsByCol(prev => ({ ...prev, [colId]: data.collection?.fragments || [] }));
      } else {
        setFragmentsByCol(prev => ({ ...prev, [colId]: [] }));
      }
    } catch {
      setFragmentsByCol(prev => ({ ...prev, [colId]: [] }));
    }
  }, []);

  function toggleExpand(colId) {
    const willOpen = !expanded[colId];
    setExpanded(prev => ({ ...prev, [colId]: willOpen }));
    if (willOpen && fragmentsByCol[colId] === undefined) {
      loadFragments(colId);
    }
  }

  async function handleRemoveFragment(colId, fragmentId) {
    try {
      const res = await authFetch(
        `/api/collections/${colId}/fragments/${fragmentId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        await loadFragments(colId);
        onChanged();
      }
    } catch (e) { console.error(e); }
  }

  async function handleConfirmDelete() {
    if (!confirmDel) return;
    try {
      const res = await authFetch(`/api/collections/${confirmDel.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConfirmDel(null);
        onChanged();
      }
    } catch (e) { console.error(e); }
  }

  return (
    <div className={s.collectionsContainer}>
      {collections.length === 0 ? (
        <>
          <div className={s.emptyState}>
            <div className={s.emptyIcon}>📚</div>
            <div className={s.emptyTitle}>{vm.noCollections}</div>
            <div className={s.emptyDesc}>{vm.noCollectionsHint}</div>
          </div>
          {/* Even on empty state, the bottom CTA is the way to start.
              No top-of-page CTA — Tim's strategy says "+ at bottom"
              like the chapter-add pattern. */}
        </>
      ) : (
        <div className={s.collectionBlockList}>
          {collections.map(c => {
            const isOpen = !!expanded[c.id];
            const frags = fragmentsByCol[c.id];
            return (
              <div key={c.id} className={s.collectionBlock}>
                <div className={s.collectionHeader}>
                  <button
                    className={s.collectionToggle}
                    onClick={() => toggleExpand(c.id)}
                  >
                    {isOpen ? '▼' : '▶'} 📖 {c.name}
                  </button>
                  <div className={s.collectionActions}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingCol(c); }}
                      title={vm.editCollection}
                    >✏️</button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDel({ id: c.id, name: c.name });
                      }}
                      title={vm.deleteCollection}
                    >🗑️</button>
                  </div>
                </div>

                {isOpen && (
                  <div className={s.fragmentListInline}>
                    {c.description && (
                      <p className={s.collectionInlineDesc}>{c.description}</p>
                    )}
                    <div className={s.collectionInlineMeta}>
                      {vm.fragmentCountLabel(c.fragment_count || 0)} · {(c.total_word_count || 0).toLocaleString()}{vm.charsLabel}
                    </div>

                    {frags === null && <Spinner />}
                    {Array.isArray(frags) && frags.length === 0 && (
                      <div className={s.emptyHint}>{vm.noFragmentsInCollection}</div>
                    )}
                    {Array.isArray(frags) && frags.length > 0 && (
                      <div className={s.fragmentRowList}>
                        {frags.map(f => (
                          <div key={f.id} className={s.fragmentRowInline}>
                            <span className={s.fragmentRowInlineTitle}>📄 {f.title}</span>
                            <span className={s.fragmentRowInlineMeta}>
                              {(f.word_count || 0).toLocaleString()}{vm.charsLabel}
                            </span>
                            <button
                              className={s.fragmentRowInlineRemove}
                              onClick={() => handleRemoveFragment(c.id, f.id)}
                              title={vm.removeFromCollection}
                            >🗑️</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      className={s.addFragmentBtnInline}
                      onClick={() => setAddingFragmentTo(c.id)}
                    >
                      {vm.addFragmentBtn}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* "+ 새 목차 만들기" — page-bottom CTA matches chapter-add pattern */}
      <button
        className={s.addCollectionBtnBottom}
        onClick={() => setShowAddModal(true)}
      >
        {vm.createCollection}
      </button>

      {showAddModal && (
        <CollectionAddModal
          lang={lang}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            onCreated();
          }}
        />
      )}

      {editingCol && (
        <CollectionEditModal
          collection={editingCol}
          lang={lang}
          onClose={() => setEditingCol(null)}
          onSaved={() => {
            setEditingCol(null);
            onChanged();
          }}
        />
      )}

      {confirmDel && (
        <CollectionDeleteConfirmModal
          name={confirmDel.name}
          lang={lang}
          onCancel={() => setConfirmDel(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {addingFragmentTo && (
        <AddFragmentToCollectionModal
          collectionId={addingFragmentTo}
          allFragments={fragments}
          existingFragmentIds={(fragmentsByCol[addingFragmentTo] || []).map(f => f.id)}
          lang={lang}
          onClose={() => setAddingFragmentTo(null)}
          onAdded={async () => {
            await loadFragments(addingFragmentTo);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// ── Collection Add Modal (was CreateCollectionModal) ───────────
function CollectionAddModal({ lang, onClose, onCreated }) {
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

// ── Collection Edit Modal (matches chapter-edit pattern) ──────
function CollectionEditModal({ collection, lang, onClose, onSaved }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [name, setName]               = useState(collection.name || '');
  const [description, setDescription] = useState(collection.description || '');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  async function handleSubmit() {
    if (!name.trim()) { setError(vm.nameRequired); return; }
    setSaving(true);
    setError('');
    try {
      const res = await authFetch(`/api/collections/${collection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || vm.errMsg);
      }
    } catch {
      setError(vm.errMsg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{vm.editCollection}</div>
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
            autoFocus
          />

          <label className={s.formLabelCol}>{vm.descriptionLabel}</label>
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
              {saving ? vm.saving : vm.saveBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Collection Delete Confirm Modal ─────────────────────────────
//
// Single delete (no preserve/with-answers branch). Collections
// are an organizational layer — fragments are NOT removed when a
// collection is deleted, just unlinked. So the confirm copy is
// reassuring ("이야기들은 그대로 남습니다").
function CollectionDeleteConfirmModal({ name, lang, onCancel, onConfirm }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>🗑️ {vm.deleteCollection}</div>
          <button className={s.modalClose} onClick={onCancel}>✕</button>
        </div>
        <div className={s.modalBody}>
          <p className={s.deletePromptInline}>
            {`"${name}"`}
          </p>
          <div className={s.deleteHintInline}>
            {vm.confirmDelete}
          </div>
          <div className={s.modalActions}>
            <button className={s.cancelBtn} onClick={onCancel}>
              {vm.cancelBtn}
            </button>
            <button className={s.btnDangerCol} onClick={onConfirm}>
              {vm.deleteCollection}
            </button>
          </div>
        </div>
      </div>
    </div>
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
          {/* 🔥 Sprint 2d — router.back() → router.push('/') (무한 루프 fix).
              🔥 Sprint 2e (2026-05-10) — ‹ 단일 아이콘 → "← 홈으로" 텍스트
                 사각 버튼. 자서전 /book/[bookId] backBtn 과 동일 visual
                 (녹색 톤, 44px, book/green identity). 세 책 흐름의
                 backBtn 디자인 통일. */}
          <button className={s.backBtn} onClick={() => router.push('/')}>
            {vm.backToHome}
          </button>
          <span className={s.pageTitle}>{vm.pageTitle}</span>
        </div>
        {/* 🔥 Sprint 2c (2026-05-10) — 우상단 "안내" + ↻ 두 버튼.
            자서전의 /book/[id] 헤더에 "안내" 가 있는 것과 동일 패턴.
            클릭 시 /architect?type=story&from=stories 로 이동해
            이야기책 6단계 안내 페이지를 띄움. */}
        <div className={s.headerRight}>
          <button
            className={s.helpBtn}
            onClick={() => router.push('/architect?type=story&from=stories')}
            title={vm.helpBtnTitle}
            aria-label={vm.helpBtnTitle}
          >
            {vm.helpBtn}
          </button>
          <button className={s.refreshBtn} onClick={loadAll} title={vm.refreshTitle}>↻</button>
        </div>
      </div>

      {/* 🔥 Tim 2026-05-06 — 홈에서 "내 이야기" 가 /chat 직행이 아닌
          이 페이지로 오게 변경됨. 그래서 목록 위에 큰 CTA 를 두어 두
          기능 (목록 + 이야기 시작) 을 한 페이지에서 처리. 빈 상태에서
          가장 prominent 하게 보여 "이야기 하기" 가 첫 행동임을 명시. */}
      <button
        className={s.tellStoryCta}
        onClick={() => router.push('/chat?mode=story')}
        type="button"
      >
        <span className={s.tellStoryIcon}>🎙️</span>
        <span className={s.tellStoryLabel}>{vm.tellStoryFromList}</span>
      </button>

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
          {/* 🔥 Tim 2026-05-06 — Stats Bar (이야기 갯수 / 글자수 / 최근 날짜)
              제거. 시니어에겐 본인이 쌓아 올린 정량 지표보다 이야기
              자체가 더 중요하다는 Tim 의 단순화 결정. 빈 화면 위쪽 공간을
              실제 이야기 카드에 양보. */}

          {/* 🔥 Tim 2026-05-06 — "확정됨" / "초안" 섹션 구분 제거.
              시니어에겐 둘의 차이가 의미있지 않음. 하나의 통합 리스트로
              관심이 이야기 자체에 집중하게 함. 날짜 내림차순 정렬. */}
          {fragments.length > 0 && (
            <div className={s.cardList}>
              {[...fragments]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map(f => (
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} lang={lang} />
                ))}
            </div>
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

          {/* 🔥 Tim 2026-05-06 — ebook 섹션 제거.
              "내 이야기" 페이지는 이제 이야기 목록 전용.
              책 만들기 흐름은 홈의 "내 자서전" / "내 수필집" 버튼으로
              이동. 이 페이지에서는 조각 자체에 집중. */}
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

      {/* 🔥 Tim 2026-05-06 — EbookModal 제거 (책 만들기 흐름은 홈으로 이동).
          showEbook state 와 EbookModal 컴포넌트는 파일 상단에 남아있으나
          UI 에서는 더 이상 호출되지 않음. 다음 정리 시 완전 제거 예정. */}

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

      {/* 🔥 Tim 2026-05-06 — 제목 바로 아래 큰 날짜 + 인라인 인디으로
          "책에 포함됨" / "포함된 사진". 시니어가 한 눈에 "언제 쓴 글이고
          책에 속한지, 사진이 있는지" 판단 가능. */}
      <div className={s.cardMeta}>
        <div className={s.cardDateLarge}>{fmtDateShort(f.created_at)}</div>
        <div className={s.cardIndicators}>
          {Array.isArray(f.photos) && f.photos.length > 0 && (
            <span className={s.photoIndicator}>📷 사진</span>
          )}
          {f.book_id && (
            <span className={s.bookBadge}>📚 책에 포함됨</span>
          )}
        </div>
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
