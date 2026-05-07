'use client';

/**
 * /photobook/[id]/preview — PDF preview surface (mobile-first).
 *
 * Strategy: STRATEGY-photobook-r3-listen-preview-2026-05-07.md §4
 *
 * Why this page exists:
 *   - <iframe src="/api/.../pdf"> can't carry a Bearer token, so the
 *     iframe loads via a Blob URL the page itself fetched.
 *   - The user gets a "what will the printed book look like" surface
 *     before committing to download.
 *   - The download button uses the ?download=true variant so the
 *     server returns Content-Disposition: attachment.
 *
 * Pattern reference: the memoir flow's PDF download in /my-stories
 * also uses fetch + blob + <a download>; this page extends it with
 * an inline iframe for visual review.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  fetchPhotobookFull,
  authFetch,
  getToken,
} from '@/components/photobook/photobookFetch';
import PrintRequestModal from '@/components/photobook/PrintRequestModal';
import s from './page.module.css';

export default function PhotobookPreviewPage() {
  const router = useRouter();
  const params = useParams();
  const photobookId = params?.id;

  const [book, setBook]               = useState(null);
  const [currentUser, setCurrentUser] = useState(null);  // for modal prefill
  const [pdfUrl, setPdfUrl]           = useState('');
  const [generating, setGenerating]   = useState(true);
  const [error, setError]             = useState('');
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast]             = useState('');
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // ── Auth gate (matches the rest of the photobook flow) ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!getToken()) {
      try { sessionStorage.setItem('postLoginRedirect', `/photobook/${photobookId}/preview`); } catch {}
      router.replace('/login');
    }
  }, [router, photobookId]);

  // ── Book metadata (for the header title) ──
  useEffect(() => {
    if (!photobookId) return;
    let cancelled = false;
    fetchPhotobookFull(photobookId)
      .then(d => { if (!cancelled) setBook(d?.photobook || null); })
      .catch(e => {
        if (!cancelled) setError(e?.message || '책을 불러올 수 없어요');
      });
    return () => { cancelled = true; };
  }, [photobookId]);

  // ── Current user (for PrintRequestModal prefill) ──
  // Fire-and-forget: failure just leaves the modal blank, user types in.
  useEffect(() => {
    let cancelled = false;
    authFetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (!cancelled && d) setCurrentUser(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── PDF Blob URL (the iframe source) ──
  // We do this once on mount; if the user wants a regenerated PDF
  // they go back, edit, and return — the route does no caching.
  useEffect(() => {
    if (!photobookId) return;
    let revokeUrl;
    let cancelled = false;
    (async () => {
      setGenerating(true);
      setError('');
      try {
        const res = await authFetch(`/api/photobooks/${photobookId}/pdf`);
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(
            err?.error
              ? `${err.error}${err.detail ? ` — ${err.detail}` : ''}`
              : `PDF 생성 실패 (${res.status})`
          );
          setGenerating(false);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        revokeUrl = URL.createObjectURL(blob);
        setPdfUrl(revokeUrl);
        setGenerating(false);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'PDF 생성 중 오류');
          setGenerating(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      // Free the Blob — keeping it costs ~PDF size in memory.
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [photobookId]);

  // ── Download (fresh fetch with ?download=true) ──
  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setError('');
    let dlUrl;
    try {
      const res = await authFetch(`/api/photobooks/${photobookId}/pdf?download=true`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `다운로드 실패 (${res.status})`);
      }
      const blob = await res.blob();
      dlUrl = URL.createObjectURL(blob);
      // Filename — strip the same chars the server allows in
      // Content-Disposition. Browser uses our `download` attribute
      // so we control the visible name.
      const safe = (book?.title || 'photobook')
        .replace(/[^\w\s가-힣-]/g, '_')
        .substring(0, 50);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${safe}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      flashToast('PDF 다운로드 시작했어요');
    } catch (e) {
      setError(e?.message || '다운로드 중 오류');
    } finally {
      setDownloading(false);
      // Give the browser a moment to start the download before
      // freeing the URL (Safari can otherwise drop the request).
      window.setTimeout(() => { if (dlUrl) URL.revokeObjectURL(dlUrl); }, 1500);
    }
  }, [photobookId, book, downloading]);

  function handleEditAgain() {
    router.push(`/photobook/${photobookId}/edit`);
  }

  function flashToast(msg) {
    setToast(msg || '');
    window.clearTimeout(flashToast._t);
    flashToast._t = window.setTimeout(() => setToast(''), 2200);
  }

  // ── Render ──
  return (
    <div className={s.page}>
      <header className={s.header}>
        <button
          type="button"
          className={s.backBtn}
          onClick={handleEditAgain}
          aria-label="돌아가기"
        >‹</button>
        <div className={s.headerTitles}>
          <div className={s.bookTitle}>{book?.title || '사진 앨범집'}</div>
          <div className={s.subTitle}>PDF 미리보기</div>
        </div>
      </header>

      <div className={s.body}>
        {error ? (
          <div className={s.statusCard}>
            <div className={s.errorBox}>{error}</div>
            <div className={s.statusDesc}>다시 편집기로 돌아가서 시도해 주세요.</div>
          </div>
        ) : generating ? (
          <div className={s.statusCard}>
            <div className={s.spinner} />
            <div className={s.statusTitle}>PDF 만드는 중…</div>
            <div className={s.statusDesc}>
              사진과 글을 모아 책 모양으로 만들고 있어요.
              잠시만 기다려 주세요 (보통 1–3초).
            </div>
          </div>
        ) : pdfUrl ? (
          <div className={s.iframeWrap}>
            <iframe
              src={pdfUrl}
              className={s.frame}
              title="PDF 미리보기"
            />
          </div>
        ) : null}
      </div>

      <div className={s.actionBar}>
        {/* 🔥 R2 (2026-05-07) — primary action is now "인쇄 신청".
            Download is moved into the secondary row so the senior eye
            lands on the high-value action first. */}
        <button
          type="button"
          className={s.btnPrintRequest}
          onClick={() => setPrintModalOpen(true)}
          disabled={generating || !!error}
        >
          📦 인쇄 신청하기
        </button>
        <div className={s.actionsSecondary}>
          <button
            type="button"
            className={`${s.btn} ${s.btnSecondary}`}
            onClick={handleEditAgain}
          >
            ✏️ 다시 편집
          </button>
          <button
            type="button"
            className={`${s.btn} ${s.btnSecondary}`}
            onClick={handleDownload}
            disabled={generating || !!error || downloading}
          >
            {downloading ? '준비 중…' : '📥 PDF 다운로드'}
          </button>
        </div>
      </div>

      {printModalOpen && (
        <PrintRequestModal
          photobookId={photobookId}
          photobook={book}
          currentUser={currentUser}
          onClose={() => setPrintModalOpen(false)}
          onSuccess={() => {
            setPrintModalOpen(false);
            router.push('/photobook');
          }}
        />
      )}

      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}
