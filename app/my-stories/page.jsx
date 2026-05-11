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
// 목차 (Table of Contents) — Sprint 1 (2026-05-09): chapterBlock 패턴.
// Sprint 2f (2026-05-10): /my-stories/customize 페이지로 이동.
//
// CollectionsView + CollectionAddModal + CollectionEditModal +
// CollectionDeleteConfirmModal + AddFragmentToCollectionModal —
// 이제 app/my-stories/customize/page.jsx 에 inline 정의됨.
// (자서전 /book/[bookId]/customize 와 같은 페이지 패턴)
// ═══════════════════════════════════════════════════════════════

// ── Main Page ────────────────────────────────────────────────────
export default function MyStoriesPage() {
  const router = useRouter();
  const lang   = useLang();

  // 🔥 Sprint 2f — collections / activeTab state 제거 (목차는 별도
  //   페이지 /my-stories/customize 로 이동). 이 페이지는 fragments 만
  //   로드하고 목록을 보여줌.
  const [fragments, setFragments]   = useState([]);
  const [books, setBooks]           = useState([]);
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
      // 🔥 Sprint 2f — /api/collections 호출 제거. 목차는 별도 페이지
      //   /my-stories/customize 가 자체 로드. 이 페이지는 fragments +
      //   books (ebook status) 만 필요.
      const [fragRes, bookRes] = await Promise.all([
        authFetch('/api/fragments?status=draft,confirmed&limit=100'),
        authFetch('/api/books/status'),
      ]);

      if (fragRes.status === 401 || bookRes.status === 401) {
        try { sessionStorage.setItem('postLoginRedirect', '/my-stories'); } catch {}
        router.replace('/login');
        return;
      }

      const fragData = await fragRes.json();
      const bookData = await bookRes.json();

      setFragments(fragData.fragments || []);
      setBooks(bookData.books || []);
    } catch (e) {
      console.error(e);
      showToast(vm.toastLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

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
      {/* 🔥 Sprint 2f (2026-05-10) — 헤더 2-row 패턴 (모바일 타이틀 잘림 해결):
            Row 1: [← 홈으로]  [안내][📋 목차]
            Row 2: 📖 내 이야기책 (full width)
          - ↻ refresh 버튼 제거 (자서전엔 없음, 시니어 친화 단순화).
          - "📋 목차" 버튼 추가 → 별도 페이지 /my-stories/customize.
          - 탭 시스템도 제거 (아래) — 자서전과 같은 진입 방식. */}
      <header className={s.header}>
        <div className={s.headerRow1}>
          <button className={s.backBtn} onClick={() => router.push('/')}>
            {vm.backToHome}
          </button>
          <div className={s.headerRight}>
            <button
              className={s.helpBtn}
              onClick={() => router.push('/architect?type=story&from=stories')}
              title={vm.helpBtnTitle}
              aria-label={vm.helpBtnTitle}
            >
              {vm.helpBtn}
            </button>
            <button
              className={s.customizeBtn}
              onClick={() => router.push('/my-stories/customize')}
              title={vm.customizeBtnTitle}
              aria-label={vm.customizeBtnTitle}
            >
              {vm.customizeBtn}
            </button>
          </div>
        </div>
        <h1 className={s.title}>{vm.pageTitle}</h1>
      </header>

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

      {/* 🔥 Sprint 2f (2026-05-10) — 탭 시스템 제거. "목차" 가 별도 페이지
          (/my-stories/customize) 로 분리되면서 활성 탭 분기 불필요. 이 페이지
          는 이야기 카드 목록 전용. */}
      {loading ? (
        <Spinner />
      ) : (
        <>
          {fragments.length > 0 && (
            <div className={s.cardList}>
              {[...fragments]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map(f => (
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} lang={lang} />
                ))}
            </div>
          )}

          {fragments.length === 0 && (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>📝</div>
              <div className={s.emptyTitle}>{vm.emptyTitleStories}</div>
              <div className={s.emptyDesc} style={{ whiteSpace: 'pre-line' }}>
                {vm.emptyDescStories}
              </div>
            </div>
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
