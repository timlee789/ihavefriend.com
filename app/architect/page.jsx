'use client';

/**
 * /architect — Architect Bot V2 entry point (6-step overview).
 *
 * Tim 정책 (2026-05-09):
 *   "유저는 하나의 자서전과 하나의 목차 하나의 소단락 질문만 가질 수 있어야 한다"
 *   → mount 시 GET /api/architect/current-book 으로 진행 중 자서전 검사:
 *       - hasBook=true  → router.replace(`/book/${id}`)  (이미 시작했으니 6단계 안내 X)
 *       - hasBook=false → 6단계 안내 + "1단계 시작" CTA
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import s from './page.module.css';

const STEPS = [
  { icon: '📋', title: '목차 만들기',       desc: '책의 큰 구조를 만듭니다' },
  { icon: '📝', title: '소제목 만들기',     desc: '각 목차의 질문들' },
  { icon: '🎙️', title: '이야기 만들기',     desc: '질문에 답하며 책 채우기' },
  { icon: '✏️', title: '이야기 수정/편집',  desc: '직접 다듬기' },
  { icon: '🎨', title: '표지 만들기',       desc: '책의 얼굴 정하기' },
  { icon: '📦', title: '책 인쇄',           desc: '완성된 책을 손에' },
];

export default function ArchitectOverviewPage() {
  // useSearchParams() requires Suspense boundary for static prerendering
  // (Next.js 16 / Turbopack). Inner component reads the params; outer
  // wraps in Suspense w/ a matching loading fallback.
  return (
    <Suspense fallback={<ArchitectLoading />}>
      <ArchitectOverviewInner />
    </Suspense>
  );
}

function ArchitectLoading() {
  return (
    <div className={s.page}>
      <div className={s.statusCard}>
        <div className={s.spinner} />
        <div className={s.statusMsg}>준비 중…</div>
      </div>
    </div>
  );
}

function ArchitectOverviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 🔥 Help mode (Tim 정책 2026-05-09): 진행 중 책이 있는 사용자가
  //   /book/[id] 의 ❓ 아이콘으로 6단계 안내를 다시 볼 수 있어야 함.
  //   ?from=book 쿼리가 있으면 resume guard 우회 + CTA 를 "돌아가기" 로 변경.
  const isHelpMode = searchParams.get('from') === 'book';

  const [state, setState]       = useState('checking'); // 'checking' | 'ready'
  const [currentBookId, setCurrentBookId] = useState(null); // help 모드에서 돌아갈 책

  useEffect(() => {
    // ── Auth gate ──
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      try { sessionStorage.setItem('postLoginRedirect', '/architect'); } catch {}
      router.replace('/login');
      return;
    }

    // ── Resume guard ──
    // 일반 모드: hasBook=true 면 즉시 그 책으로 redirect (6단계 안내 X).
    // 도움말 모드 (?from=book): redirect 안 함 — 6단계를 다시 보여주고
    //   CTA 가 "← 자서전으로 돌아가기" 로 바뀜.
    let cancelled = false;
    fetch('/api/architect/current-book', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        if (d?.hasBook && d.book?.id) {
          if (isHelpMode) {
            // 책 id 보관해서 "돌아가기" 로 정확히 그 책으로 가도록.
            setCurrentBookId(d.book.id);
            setState('ready');
            return;
          }
          router.replace(`/book/${d.book.id}`);
          return;
        }
        setState('ready');
      })
      .catch(() => {
        // best-effort: API 실패해도 6단계 페이지는 보여줌
        if (!cancelled) setState('ready');
      });
    return () => { cancelled = true; };
  }, [router, isHelpMode]);

  if (state === 'checking') {
    return (
      <div className={s.page}>
        <div className={s.statusCard}>
          <div className={s.spinner} />
          <div className={s.statusMsg}>준비 중…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button
          type="button"
          className={s.backBtn}
          onClick={() => {
            // help 모드: 그 책으로 정확히 복귀 (history back 보다 안정적)
            if (isHelpMode && currentBookId) {
              router.push(`/book/${currentBookId}`);
            } else {
              router.push('/');
            }
          }}
          aria-label={isHelpMode ? '자서전으로 돌아가기' : '홈으로'}
        >‹</button>
        <span className={s.backLabel}>
          {isHelpMode ? '자서전으로' : '홈으로'}
        </span>
      </header>

      <div className={s.titleBlock}>
        <h1 className={s.title}>📚 책 만들기 시작</h1>
        <p className={s.intro}>
          {`당신과 비슷한 인생 이야기를 골라보세요.\n그 위에 당신의 이야기를 만들어 갑시다.`}
        </p>
      </div>

      <div className={s.steps}>
        {STEPS.map((step, i) => (
          <div key={i} className={s.step}>
            <div className={s.stepNumber}>{i + 1}</div>
            <div className={s.stepIcon}>{step.icon}</div>
            <div className={s.stepBody}>
              <div className={s.stepTitle}>{step.title}</div>
              <div className={s.stepDesc}>{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={s.cta}
        onClick={() => {
          // 도움말 모드: 책으로 복귀 (이미 시작한 사용자라 1단계 다시 X)
          if (isHelpMode && currentBookId) {
            router.push(`/book/${currentBookId}`);
            return;
          }
          router.push('/architect/sample/1');
        }}
      >
        {isHelpMode ? '← 자서전으로 돌아가기' : '▶ 1단계 시작하기'}
      </button>
      <div className={s.ctaSub}>
        {isHelpMode
          ? '이미 자서전을 시작하셨어요. 위 단계를 참고해 주세요.'
          : '5개 시나리오 중에서 비슷한 것을 고르세요'}
      </div>
    </div>
  );
}
