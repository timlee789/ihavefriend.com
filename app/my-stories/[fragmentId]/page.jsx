'use client';

/**
 * /my-stories/[fragmentId] — 이야기 상세 페이지 (Sprint 2b, 2026-05-10).
 *
 * 이전: /my-stories 카드 클릭 → <FragmentModal/> overlay (slide-up sheet).
 * 변경: 별도 페이지 — URL 변하고, browser back/refresh/공유 자연스러움.
 *
 * 핵심 결정: FragmentModal 자체 변경 X. `inline=true` prop (Task 83 에서
 * 추가됨, /book/.../question/[qId] 가 이미 사용 중) 을 그대로 활용해서
 * overlay/animation/handle 없이 페이지 컨텐츠로 렌더. FragmentDetail
 * 컴포넌트 추출 불필요 — 작업 단순화.
 *
 * 헤더 패턴: Sprint 2f 의 2-row 헤더. Row 1 = backBtn 만 (페이지 제목은
 * FragmentModal 내부가 처리). CSS 는 부모 /my-stories/page.module.css
 * 재사용 (Sprint 2f /my-stories/customize 와 동일 패턴).
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import FragmentModal from '@/components/fragments/FragmentModal';
import { VIS_MSGS } from '@/components/fragments/fragmentI18n';
import { getToken, authFetch, Spinner } from '@/components/fragments/fragmentHelpers';
// 부모 /my-stories/page.module.css 재사용 — 같은 class hash 공유로
// 헤더 / backBtn / emptyState 등이 정확히 일관됨. Sprint 2f 의 customize
// 페이지와 동일 패턴.
import s from '../page.module.css';

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

export default function FragmentDetailPage() {
  const router = useRouter();
  const { fragmentId } = useParams();
  const lang = useLang();
  const vm   = VIS_MSGS[lang] || VIS_MSGS.KO;

  const [fragment, setFragment] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // ── Auth + load ────────────────────────────────────────────────
  const loadFragment = useCallback(async () => {
    const token = getToken();
    if (!token) {
      try {
        sessionStorage.setItem('postLoginRedirect', `/my-stories/${fragmentId}`);
      } catch {}
      router.replace('/login');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`/api/fragments/${fragmentId}`);
      if (res.status === 401) {
        try {
          sessionStorage.setItem('postLoginRedirect', `/my-stories/${fragmentId}`);
        } catch {}
        router.replace('/login');
        return;
      }
      if (res.status === 404) {
        setError(vm.fragmentNotFound);
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.ok && data?.fragment) {
        setFragment(data.fragment);
      } else {
        setError(vm.fragmentNotFound);
      }
    } catch (e) {
      console.error('[/my-stories/[fragmentId]] load failed:', e?.message);
      setError(vm.toastLoadFailed || vm.fragmentNotFound);
    } finally {
      setLoading(false);
    }
  }, [fragmentId, router, vm]);

  useEffect(() => { loadFragment(); }, [loadFragment]);

  // ── Callbacks (FragmentModal 콜백) ──────────────────────────────
  // - onUpdated: 편집·visibility·continuation 등 모든 mutation 후 호출.
  //   updated fragment 를 그대로 set → FragmentModal 이 다시 렌더.
  // - onPhotosChanged: photo upload/delete 시 photos array 만 patch.
  // - onDeleted: 삭제 후 목록 페이지로 복귀 (이 페이지는 unmount 됨).
  function handleUpdated(updated) {
    setFragment(updated);
  }
  function handlePhotosChanged(_id, photos) {
    setFragment(prev => (prev ? { ...prev, photos } : prev));
  }
  function handleDeleted() {
    router.push('/my-stories');
  }

  // ── Render: loading / 404 / 정상 ───────────────────────────────
  // 헤더는 세 상태에서 동일 — Row 1 의 backBtn 만 (Sprint 2f 의
  // sub-page 패턴). Row 2 는 FragmentModal 내부 컨텐츠가 처리.
  const headerBlock = (
    <header className={s.header}>
      <div className={s.headerRow1}>
        <button
          className={s.backBtn}
          onClick={() => router.push('/my-stories')}
        >
          {vm.backToStories}
        </button>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className={s.page}>
        {headerBlock}
        <Spinner />
      </div>
    );
  }

  if (error || !fragment) {
    return (
      <div className={s.page}>
        {headerBlock}
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>⚠️</div>
          <div className={s.emptyTitle}>{error || vm.fragmentNotFound}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      {headerBlock}

      {/* FragmentModal inline=true: overlay / slide animation / handle /
          close 버튼 없이 컨텐츠만. /book/.../question/[qId] 가 이미 같은
          패턴 (Task 83). edit / delete / photo / visibility / continuation /
          collection picker / audio QR — 모든 기능 그대로 작동.
          onClose 는 inline 모드에서 호출 안 되니 전달 X. */}
      <FragmentModal
        fragment={fragment}
        inline={true}
        onUpdated={handleUpdated}
        onPhotosChanged={handlePhotosChanged}
        onDeleted={handleDeleted}
        lang={lang}
      />
    </div>
  );
}
