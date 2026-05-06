'use client';

/**
 * /photobook/[id]/edit — main editor (mobile, full-screen).
 *
 * Owns: photobook + pages array. Loads once on mount, mutates locally
 * after each child callback so the UI stays snappy without refetches.
 *
 * URL-state: ?page=N (1-based) — bookmarkable + back-button friendly.
 *
 * Strategy: STRATEGY-photobook-expansion-v3-2026-05-06.md §4 F3.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  fetchPhotobookFull,
  patchPhotobook,
  addPage,
  deletePage,
  reorderPages,
  getToken,
} from '@/components/photobook/photobookFetch';
import { pbMsgs } from '@/components/photobook/photobookI18n';
import PageCanvas from '@/components/photobook/PageCanvas';
import PageNavigator from '@/components/photobook/PageNavigator';
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

export default function PhotobookEditPage() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const photobookId = params?.id;
  const lang = useLang();
  const m = pbMsgs(lang);

  const [photobook, setPhotobook] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const lastSavedTitle = useRef('');
  const [titleSaving, setTitleSaving] = useState(false);

  // Current page index — derived from ?page= (1-based) but clamped to
  // the actual page count on every render.
  const pageParam = Number(search.get('page')) || 1;
  const currentIndex = Math.max(0, Math.min(pageParam - 1, Math.max(0, pages.length - 1)));

  // ── Load photobook ────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!getToken()) {
      try { sessionStorage.setItem('postLoginRedirect', `/photobook/${photobookId}/edit`); } catch {}
      router.replace('/login');
      return;
    }
    setLoading(true);
    try {
      const data = await fetchPhotobookFull(photobookId);
      setPhotobook(data.photobook);
      setPages(data.pages || []);
      setTitleDraft(data.photobook?.title || '');
      lastSavedTitle.current = data.photobook?.title || '';
    } catch (e) {
      console.error('[/photobook/edit] load failed:', e?.message);
      flashToast(m.loadFailed);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photobookId, router]);

  useEffect(() => { load(); }, [load]);

  function flashToast(msg) {
    setToast(msg || '');
    window.clearTimeout(flashToast._t);
    flashToast._t = window.setTimeout(() => setToast(''), 2400);
  }

  // ── Page navigation: keep ?page in sync ────────────────────────
  // `total` is optional — pass when the latest pages length isn't yet
  // reflected in state (e.g. right after setPages([…, newPage])).
  function navigateTo(idx, total = pages.length) {
    const safe = Math.max(0, Math.min(idx, Math.max(0, total - 1)));
    const sp = new URLSearchParams(search.toString());
    sp.set('page', String(safe + 1));
    router.replace(`/photobook/${photobookId}/edit?${sp.toString()}`, { scroll: true });
  }

  // ── Title autosave ─────────────────────────────────────────────
  async function commitTitle() {
    const next = (titleDraft || '').trim();
    if (!next || next === lastSavedTitle.current) return;
    lastSavedTitle.current = next;
    setTitleSaving(true);
    try {
      await patchPhotobook(photobookId, { title: next });
      setPhotobook(p => p ? { ...p, title: next } : p);
    } catch (e) {
      console.error('[/photobook/edit] title save failed:', e?.message);
      flashToast(m.saveFailed);
    } finally {
      setTitleSaving(false);
    }
  }

  // ── Page mutations ─────────────────────────────────────────────
  async function handleAddPage() {
    if (busy) return;
    setBusy(true);
    try {
      const page = await addPage(photobookId);
      setPages(prev => {
        const next = [...prev, page];
        // Jump to the new page. Pass `next.length` explicitly because
        // `pages` (in navigateTo's closure) is still the old array.
        window.setTimeout(() => navigateTo(next.length - 1, next.length), 0);
        return next;
      });
    } catch (e) {
      console.error('[/photobook/edit] add page failed:', e?.message);
      flashToast(e?.message || m.error);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePage() {
    if (busy) return;
    if (pages.length === 0) return;
    if (!window.confirm(m.pageDeletePrompt)) return;
    const target = pages[currentIndex];
    if (!target) return;
    setBusy(true);
    try {
      await deletePage(photobookId, target.id);
      setPages(prev => {
        const next = prev.filter(p => p.id !== target.id);
        // Move to the previous page (or to nothing if list emptied).
        const newIdx = Math.max(0, Math.min(currentIndex, next.length - 1));
        if (next.length > 0) {
          window.setTimeout(() => navigateTo(newIdx, next.length), 0);
        }
        return next;
      });
    } catch (e) {
      console.error('[/photobook/edit] delete page failed:', e?.message);
      flashToast(e?.message || m.error);
    } finally {
      setBusy(false);
    }
  }

  async function handleReorder(orderedIds) {
    if (busy) return;
    const targetId = pages[currentIndex]?.id;
    setBusy(true);
    try {
      await reorderPages(photobookId, orderedIds);
      // Re-read to get fresh page_number values.
      const data = await fetchPhotobookFull(photobookId);
      setPages(data.pages || []);
      // Try to keep the user on the same logical page after the reshuffle.
      const newIdx = (data.pages || []).findIndex(p => p.id === targetId);
      if (newIdx >= 0) navigateTo(newIdx);
    } catch (e) {
      console.error('[/photobook/edit] reorder failed:', e?.message);
      flashToast(e?.message || m.error);
    } finally {
      setBusy(false);
    }
  }

  // Patch helper for PageCanvas — merges a partial into the current page.
  function patchCurrentPage(partial) {
    if (!partial || pages.length === 0) return;
    setPages(prev => prev.map((p, i) => i === currentIndex ? { ...p, ...partial } : p));
  }

  const currentPage = pages[currentIndex] || null;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={s.page}>
      <header className={s.header}>
        <button
          type="button"
          className={s.backBtn}
          onClick={() => router.push('/photobook')}
          aria-label={m.backBtn}
        >‹</button>
        <input
          className={s.titleInput}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          placeholder={m.bookTitlePlaceholder}
          maxLength={200}
        />
        {titleSaving && <span className={s.savingHint}>{m.saving}</span>}
        <button
          type="button"
          className={s.headerAddBtn}
          onClick={handleAddPage}
          disabled={busy}
        >
          {busy ? m.addingPage : m.addPageBtn}
        </button>
      </header>

      {loading ? (
        <div className={s.spinner}>
          <div className={s.spinnerDot} />
          <div className={s.spinnerDot} />
          <div className={s.spinnerDot} />
        </div>
      ) : pages.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📷</div>
          <div className={s.emptyTitle}>{m.editorEmptyTitle}</div>
          <div className={s.emptyDesc}>{m.editorEmptyDesc}</div>
          <button
            type="button"
            className={s.emptyCta}
            onClick={handleAddPage}
            disabled={busy}
          >
            {busy ? m.addingPage : m.addPageBtn}
          </button>
        </div>
      ) : currentPage ? (
        <PageCanvas
          photobookId={photobookId}
          page={currentPage}
          lang={lang}
          onPatchPage={patchCurrentPage}
        />
      ) : null}

      {/* Always mount the navigator once we've loaded — it owns add/delete/reorder UI */}
      {!loading && (
        <PageNavigator
          pages={pages}
          currentIndex={currentIndex}
          onNavigate={navigateTo}
          onAdd={handleAddPage}
          onDelete={handleDeletePage}
          onReorder={handleReorder}
          busy={busy}
          lang={lang}
        />
      )}

      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}
