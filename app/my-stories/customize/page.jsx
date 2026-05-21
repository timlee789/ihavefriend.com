'use client';

/**
 * /my-stories/customize — 이야기책 목차 만들기 페이지 (Sprint 2f).
 *
 * 이전: /my-stories 안의 "목차" 탭 (활성탭 전환).
 * 변경: 별도 페이지 — 자서전 /book/[bookId]/customize 와 같은 패턴.
 *   - 2-row 헤더: [← 내 이야기책으로] [안내] / 📋 목차 만들기
 *   - 본문: CollectionsView (Sprint 1 의 chapterBlock 패턴 + 4 modals)
 *
 * 데이터 / API / 모달 로직은 100% 동일. /my-stories/page.jsx 에서 이 페이지로
 * 이동만. CollectionsView + 4 modals 는 inline 정의 (자서전 customize
 * 와 같은 패턴 — 단일 파일 self-contained).
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { VIS_MSGS } from '@/components/fragments/fragmentI18n';
import { getToken, authFetch, Spinner, pdfPostAndOpen } from '@/components/fragments/fragmentHelpers';
// Reuse the parent /my-stories CSS module — same class names
// (`.collectionBlock`, `.fragmentRowInline`, all modal classes, etc.)
// already defined there from Sprint 1. The new 2-row header classes
// (`.headerRow1`, `.title`, `.intro`, `.customizeBtn`) get added to
// that same parent file in this sprint.
import s from '../page.module.css';

// Beta Step 2b (2026-05-21) — pdfPostAndOpen 은 fragmentHelpers 로 이동 (재사용).
//   /my-stories 목록에서도 동일 헬퍼 사용.

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

export default function MyStoriesCustomizePage() {
  const router = useRouter();
  const lang   = useLang();
  const vm     = VIS_MSGS[lang] || VIS_MSGS.KO;

  const [collections, setCollections] = useState([]);
  const [fragments, setFragments]     = useState([]); // needed for AddFragmentToCollectionModal
  const [loading, setLoading]         = useState(true);

  const loadAll = useCallback(async () => {
    const token = getToken();
    if (!token) {
      try { sessionStorage.setItem('postLoginRedirect', '/my-stories/customize'); } catch {}
      router.replace('/login');
      return;
    }
    setLoading(true);
    try {
      const [fragRes, colRes] = await Promise.all([
        authFetch('/api/fragments?status=draft,confirmed&limit=100'),
        authFetch('/api/collections'),
      ]);
      if (fragRes.status === 401) {
        try { sessionStorage.setItem('postLoginRedirect', '/my-stories/customize'); } catch {}
        router.replace('/login');
        return;
      }
      const fragData = await fragRes.json();
      const colData  = colRes.ok ? await colRes.json() : { collections: [] };
      setFragments(fragData.fragments || []);
      setCollections(colData.collections || []);
    } catch (e) {
      console.error('[/my-stories/customize loadAll]', e?.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Lightweight refresh for collections only after mutation.
  const reloadCollections = useCallback(async () => {
    try {
      const res = await authFetch('/api/collections');
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections || []);
      }
    } catch (e) {
      console.error('[reloadCollections]', e?.message);
    }
  }, []);

  return (
    <div className={s.page}>
      <header className={s.header}>
        {/* Row 1: backBtn + helpBtn */}
        <div className={s.headerRow1}>
          <button
            className={s.backBtn}
            onClick={() => router.push('/my-stories')}
          >
            {vm.backToStories}
          </button>
          <button
            className={s.helpBtn}
            onClick={() => router.push('/architect?type=story&from=stories')}
            title={vm.helpBtnTitle}
            aria-label={vm.helpBtnTitle}
          >
            {vm.helpBtn}
          </button>
        </div>
        {/* Row 2: 페이지 제목 (full width) */}
        <h1 className={s.title}>{vm.customizeHeader}</h1>
        <p className={s.intro}>{vm.customizeIntro}</p>
      </header>

      {loading ? (
        <Spinner />
      ) : (
        <CollectionsView
          collections={collections}
          fragments={fragments}
          onCreated={reloadCollections}
          onChanged={reloadCollections}
          lang={lang}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CollectionsView + 4 modals (자서전 customize 의 chapterBlock 패턴).
// Sprint 1 에서 정의된 inline-expand 구조 — /my-stories/page.jsx 에서
// 이 페이지로 이동. 데이터 / API / 로직 100% 동일.
// ═══════════════════════════════════════════════════════════════

function CollectionsView({ collections, onCreated, onChanged, lang, fragments }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [expanded, setExpanded] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCol, setEditingCol] = useState(null);
  // Beta Step 2 — PDF 버튼 상태. busy = 'preview' | 'generate' | null
  const [pdfBusy, setPdfBusy] = useState(null);
  const [pdfError, setPdfError] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [addingFragmentTo, setAddingFragmentTo] = useState(null);

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
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>📚</div>
          <div className={s.emptyTitle}>{vm.noCollections}</div>
          <div className={s.emptyDesc}>{vm.noCollectionsHint}</div>
        </div>
      ) : (
        <div className={s.collectionBlockList}>
          {collections.map(c => {
            const isOpen = !!expanded[c.id];
            const frags  = fragmentsByCol[c.id];
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

      {/* Beta Step 2 (2026-05-21) — 이야기책 PDF.
          collection 1개 이상 + 그 안에 fragment 1개 이상일 때 노출.
          empty collection 만 있으면 endpoint 가 no_chapters 응답 → 버튼 hide 가 자연. */}
      {collections.some(c => (c.fragment_count || 0) > 0) && (
        <>
          <div className={s.storyBookActions}>
            <button
              className={s.storyBookPreviewBtn}
              disabled={!!pdfBusy}
              onClick={() => pdfPostAndOpen({
                url: '/api/collections-book/preview',
                asDownload: false,
                setBusy: (b) => setPdfBusy(b ? 'preview' : null),
                setErr: setPdfError,
                errMsg: vm.storyBookFailed,
              })}
            >
              {pdfBusy === 'preview' ? vm.storyBookPreviewing : vm.makeStoryBookBtn}
            </button>
            <button
              className={s.storyBookGenerateBtn}
              disabled={!!pdfBusy}
              onClick={() => pdfPostAndOpen({
                url: '/api/collections-book/generate',
                asDownload: true,
                downloadName: (lang === 'EN' ? 'My Stories' : lang === 'ES' ? 'Mis historias' : '나의 이야기책') + '.pdf',
                setBusy: (b) => setPdfBusy(b ? 'generate' : null),
                setErr: setPdfError,
                errMsg: vm.storyBookFailed,
              })}
            >
              {pdfBusy === 'generate' ? vm.storyBookGenerating : vm.downloadStoryPdf}
            </button>
          </div>
          {pdfError && <div className={s.storyBookError}>⚠️ {pdfError}</div>}
        </>
      )}

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

// ── Collection Add Modal ────────────────────────────────────────
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

// ── Collection Edit Modal ──────────────────────────────────────
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

// ── Collection Delete Confirm Modal ────────────────────────────
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
          <p className={s.deletePromptInline}>{`"${name}"`}</p>
          <div className={s.deleteHintInline}>{vm.confirmDelete}</div>
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

// ── Add Fragment to Collection Modal ──────────────────────────
function AddFragmentToCollectionModal({ collectionId, allFragments, existingFragmentIds, lang, onClose, onAdded }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [adding, setAdding] = useState(null);

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
