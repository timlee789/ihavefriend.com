'use client';

/**
 * /photobook — book list (mobile-first card grid).
 *
 * Patterns:
 *   - useLang() reads localStorage 'lang' (KO default).
 *   - 401 → redirect to /login (with postLoginRedirect stash, matches
 *     /my-stories so the bounce returns here after sign-in).
 *
 * Strategy: STRATEGY-photobook-expansion-v3-2026-05-06.md §4 F1.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchPhotobookList, getToken } from '@/components/photobook/photobookFetch';
import { pbMsgs } from '@/components/photobook/photobookI18n';
import s from './page.module.css';

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

export default function PhotobookListPage() {
  const router = useRouter();
  const lang = useLang();
  const m = pbMsgs(lang);

  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!getToken()) {
      try { sessionStorage.setItem('postLoginRedirect', '/photobook'); } catch {}
      router.replace('/login');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const list = await fetchPhotobookList();
      setBooks(list);
    } catch (e) {
      console.error('[/photobook] load failed:', e?.message);
      setError(m.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [router, m]);

  useEffect(() => { load(); }, [load]);

  function goNew() { router.push('/photobook/new'); }
  function goEdit(id) { router.push(`/photobook/${id}/edit`); }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.headerLeft}>
          {/* 🔥 Sprint 2e (2026-05-10) — ‹ 단일 아이콘 → "← 홈으로" 텍스트
              사각 버튼 (자서전 /book/[bookId] 패턴). 세 책 흐름 backBtn
              디자인 통일. aria-label 제거 — 텍스트 라벨 자체가 명확. */}
          <button className={s.backBtn} onClick={() => router.push('/')}>
            {m.backToHome}
          </button>
          <span className={s.pageTitle}>{m.pageTitleList}</span>
        </div>
        {/* 🔥 Sprint 2d (2026-05-10) — 우상단 "안내" + "+ 새 사진 앨범집"
            두 버튼. /my-stories 헤더의 helpBtn 패턴 (Sprint 2c) 그대로
            복제. 클릭 시 /architect?type=photobook&from=photobook 으로
            이동해 사진책 6단계 안내 페이지를 띄움. */}
        <div className={s.headerRight}>
          <button
            className={s.helpBtn}
            onClick={() => router.push('/architect?type=photobook&from=photobook')}
            title={m.helpBtnTitle}
            aria-label={m.helpBtnTitle}
          >
            {m.helpBtn}
          </button>
          <button className={s.newBtn} onClick={goNew}>{m.newBookBtn}</button>
        </div>
      </header>

      {loading ? (
        <div className={s.spinner}>
          <div className={s.spinnerDot} />
          <div className={s.spinnerDot} />
          <div className={s.spinnerDot} />
        </div>
      ) : books.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📷</div>
          <div className={s.emptyTitle}>{m.listEmptyTitle}</div>
          <div className={s.emptyDesc}>{m.listEmptyDesc}</div>
          <button className={s.emptyCta} onClick={goNew}>{m.newBookBtn}</button>
        </div>
      ) : (
        <div className={s.list}>
          {books.map(b => (
            <button
              key={b.id}
              className={s.card}
              onClick={() => goEdit(b.id)}
              type="button"
            >
              <div className={s.cover}>
                {b.cover_photo_id ? (
                  <img
                    src={`/api/photobook-photo/${b.cover_photo_id}`}
                    alt={m.coverPhotoAlt}
                    className={s.coverImg}
                  />
                ) : (
                  <div className={s.coverBlank}>📷</div>
                )}
              </div>
              <div className={s.cardBody}>
                <div className={s.cardTitle}>{b.title || m.untitledBook}</div>
                {b.subtitle && <div className={s.cardSubtitle}>{b.subtitle}</div>}
                <div className={s.cardMeta}>
                  <span className={s.cardMetaCount}>{m.pageCountLabel(b.page_count || 0)}</span>
                  <span>{fmtDate(b.last_active_at || b.started_at)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {error && <div className={s.toast}>{error}</div>}
    </div>
  );
}
