'use client';

/**
 * components/fragments/FragmentCollectionPicker.jsx  (Task 82)
 *
 * Extracted from /my-stories/page.jsx. Behavior identical — a
 * bottom-sheet modal that lists every collection and lets the user
 * toggle this fragment in/out with optimistic UI.
 *
 * Reuses /my-stories/page.module.css so /my-stories' visual stays
 * pixel-identical, and the book-question surface picks up the same
 * styling for free.
 */

import { useState, useEffect } from 'react';
import { VIS_MSGS } from './fragmentI18n';
import { authFetch, Spinner } from './fragmentHelpers';
import s from '@/app/my-stories/page.module.css';

export default function FragmentCollectionPicker({
  fragmentId,
  currentCollectionIds,
  lang,
  onClose,
  onChanged,
}) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [localIds, setLocalIds] = useState(new Set(currentCollectionIds));

  useEffect(() => {
    setLocalIds(new Set(currentCollectionIds));
  }, [currentCollectionIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/collections');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCollections(data.collections || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function bumpCount(collectionId, delta) {
    setCollections(prev => prev.map(c =>
      c.id === collectionId
        ? { ...c, fragment_count: Math.max(0, (c.fragment_count || 0) + delta) }
        : c
    ));
  }

  async function handleAdd(collectionId) {
    setBusyId(collectionId);
    setLocalIds(prev => new Set(prev).add(collectionId));
    bumpCount(collectionId, +1);
    try {
      const res = await authFetch(`/api/collections/${collectionId}/fragments`, {
        method: 'POST',
        body: JSON.stringify({ fragmentId }),
      });
      if (res.ok || res.status === 409) {
        onChanged && onChanged();
      } else {
        console.warn('[FragmentCollectionPicker] add failed, rolling back', collectionId, res.status);
        setLocalIds(prev => { const n = new Set(prev); n.delete(collectionId); return n; });
        bumpCount(collectionId, -1);
      }
    } catch (e) {
      console.warn('[FragmentCollectionPicker] add error, rolling back', e?.message);
      setLocalIds(prev => { const n = new Set(prev); n.delete(collectionId); return n; });
      bumpCount(collectionId, -1);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(collectionId) {
    setBusyId(collectionId);
    setLocalIds(prev => { const n = new Set(prev); n.delete(collectionId); return n; });
    bumpCount(collectionId, -1);
    try {
      const res = await authFetch(
        `/api/collections/${collectionId}/fragments/${fragmentId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        onChanged && onChanged();
      } else {
        console.warn('[FragmentCollectionPicker] remove failed, rolling back', collectionId, res.status);
        setLocalIds(prev => new Set(prev).add(collectionId));
        bumpCount(collectionId, +1);
      }
    } catch (e) {
      console.warn('[FragmentCollectionPicker] remove error, rolling back', e?.message);
      setLocalIds(prev => new Set(prev).add(collectionId));
      bumpCount(collectionId, +1);
    } finally {
      setBusyId(null);
    }
  }

  function handleToggle(collectionId) {
    const isIn = localIds.has(collectionId);
    return isIn ? handleRemove(collectionId) : handleAdd(collectionId);
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{vm.pickCollectionTitle}</div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={s.modalBody}>
          {loading ? (
            <Spinner />
          ) : collections.length === 0 ? (
            <div className={s.emptyHint}>{vm.noCollectionsYet}</div>
          ) : (
            <div className={s.collectionPickerList}>
              {collections.map(c => {
                const isIn = localIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    className={`${s.collectionPickerRow} ${isIn ? s.collectionPickerActive : ''}`}
                    onClick={() => handleToggle(c.id)}
                    disabled={busyId === c.id}
                  >
                    <div className={s.collectionPickerMain}>
                      <div className={s.collectionPickerTitle}>{c.name}</div>
                      <div className={s.collectionPickerMeta}>
                        {vm.fragmentCountLabel(c.fragment_count || 0)}
                      </div>
                    </div>
                    <div className={s.collectionPickerCheck}>
                      {busyId === c.id ? '…' : (isIn ? '✓' : '➕')}
                    </div>
                  </button>
                );
              })}
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
