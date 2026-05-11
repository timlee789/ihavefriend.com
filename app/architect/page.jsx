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

import { Fragment, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import s from './page.module.css';

// 🔥 Sprint 2a (2026-05-10) — arrowAfter 필드 추가. Tim 정정 (스크린샷
//   검토): 1↔2 / 2↔3 / 3↔4 양방향 (사용자 자유롭게 오감), 4→5 / 5→6
//   단방향 (수정 끝나면 표지, 표지 끝나면 인쇄 — 진행 흐름 고정).
//   화살표 색: 양방향 = 녹색 (가능 시그널), 단방향 = 주황 흐릿 (방향 가이드).
//
// 🔥 Sprint 2c (2026-05-10) — STEPS_MEMOIR / STEPS_STORY 두 array 분리.
//   자서전 (memoir) 은 top-down: 시나리오 → 목차 → 소제목 → 이야기.
//   이야기책 (story) 은 bottom-up: 이야기 자유 작성 → 목차 → 연결.
//   4-5-6 (수정 / 표지 / 인쇄) 은 두 흐름 공통. ?type=story query 로
//   분기 (단일 route, 단일 컴포넌트 유지).
const STEPS_MEMOIR = [
  { icon: '📋', title: '목차 만들기',       desc: '책의 큰 구조를 만듭니다',
    arrowAfter: 'bidirectional' },
  { icon: '📝', title: '소제목 만들기',     desc: '각 목차의 질문들',
    arrowAfter: 'bidirectional' },
  { icon: '🎙️', title: '이야기 만들기',     desc: '질문에 답하며 책 채우기',
    arrowAfter: 'bidirectional' },
  { icon: '✏️', title: '이야기 수정/편집',  desc: '직접 다듬기',
    arrowAfter: 'forward' },
  { icon: '🎨', title: '표지 만들기',       desc: '책의 얼굴 정하기',
    arrowAfter: 'forward' },
  { icon: '📦', title: '책 인쇄',           desc: '완성된 책을 손에',
    arrowAfter: null },
];

const STEPS_STORY = [
  { icon: '🎙️', title: '이야기 만들기',     desc: 'Emma 와 대화하거나 직접 자유롭게 작성',
    arrowAfter: 'bidirectional' },
  { icon: '📋', title: '목차 만들기',       desc: '이야기들을 묶을 챕터를 만듭니다',
    arrowAfter: 'bidirectional' },
  { icon: '🔗', title: '이야기 연결',       desc: '만든 이야기를 목차에 연결합니다',
    arrowAfter: 'bidirectional' },
  { icon: '✏️', title: '이야기 수정/편집',  desc: '직접 다듬기',
    arrowAfter: 'forward' },
  { icon: '🎨', title: '표지 만들기',       desc: '책의 얼굴 정하기',
    arrowAfter: 'forward' },
  { icon: '📦', title: '책 인쇄',           desc: '완성된 책을 손에',
    arrowAfter: null },
];

// 🔥 Sprint 2d (2026-05-10) — 사진책 흐름. photo-first (시각 기반):
//   사진 한 장에 추억 한 줄, 페이지 순서 정리. 4-5-6 (수정/표지/인쇄)
//   는 자서전·이야기책과 완전 동일. ?type=photobook 으로 분기.
const STEPS_PHOTOBOOK = [
  { icon: '📷', title: '사진 모으기',       desc: '카메라나 앨범에서 사진을 추가합니다',
    arrowAfter: 'bidirectional' },
  { icon: '📝', title: '이야기 쓰기',       desc: '각 사진에 짧은 이야기를 적습니다',
    arrowAfter: 'bidirectional' },
  { icon: '🔀', title: '페이지 정리',       desc: '페이지 순서를 바꾸고 정리합니다',
    arrowAfter: 'bidirectional' },
  { icon: '✏️', title: '이야기 수정/편집',  desc: '직접 다듬기',
    arrowAfter: 'forward' },
  { icon: '🎨', title: '표지 만들기',       desc: '책의 얼굴 정하기',
    arrowAfter: 'forward' },
  { icon: '📦', title: '책 인쇄',           desc: '완성된 책을 손에',
    arrowAfter: null },
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
  //
  // 🔥 Sprint 2c (2026-05-10) — ?type=story 분기 추가 (이야기책 안내).
  // 🔥 Sprint 2d (2026-05-10) — ?type=photobook 분기 추가 (사진책 안내).
  //   세 흐름 (자서전 / 이야기책 / 사진책) 한 컴포넌트에서 처리.
  //   ?type=story|photobook 은 항상 도움말 모드 — 진입점이 다른 페이지
  //   (/my-stories, /photobook) 라서 resume guard API 호출 불필요.
  //   우선순위: photobook > story > 자서전 default.
  const fromParam       = searchParams.get('from');
  const typeParam       = searchParams.get('type');
  const isStoryType     = typeParam === 'story';
  const isPhotobookType = typeParam === 'photobook';
  const isHelpMode      = !!fromParam || isStoryType || isPhotobookType;

  // Active STEPS / 제목 / 인트로 — 3-way (photobook > story > memoir).
  const STEPS = isPhotobookType ? STEPS_PHOTOBOOK
              : isStoryType     ? STEPS_STORY
              : STEPS_MEMOIR;
  const titleText = isPhotobookType ? '📷 사진 앨범집 만들기'
                  : isStoryType     ? '📖 이야기책 만들기'
                  : '📚 책 만들기 시작';
  const introText = isPhotobookType
    ? '사진 한 장에 추억 한 줄.\n가족과 함께 펼쳐볼 작은 책을 만들어요.'
    : isStoryType
      ? '이야기를 자유롭게 모으고, 나중에 책으로 묶으세요.\n어디부터 시작해도 좋아요.'
      : '당신과 비슷한 인생 이야기를 골라보세요.\n그 위에 당신의 이야기를 만들어 갑시다.';

  const [state, setState]       = useState('checking'); // 'checking' | 'ready'
  const [currentBookId, setCurrentBookId] = useState(null); // help 모드에서 돌아갈 책

  useEffect(() => {
    // ── Auth gate ──
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      // Sprint 2d: 3-way postLoginRedirect — type 에 따라 적절한 URL 저장
      // 해서 로그인 후 정확한 안내 페이지로 복귀.
      const target = isPhotobookType ? '/architect?type=photobook&from=photobook'
                   : isStoryType     ? '/architect?type=story&from=stories'
                   : '/architect';
      try { sessionStorage.setItem('postLoginRedirect', target); } catch {}
      router.replace('/login');
      return;
    }

    // 🔥 Sprint 2c/2d — 이야기책 / 사진책 모드는 항상 안내 페이지.
    //   진입점이 다른 페이지 (/my-stories, /photobook) 라서 자서전
    //   resume guard API 호출이 불필요. 즉시 ready 로.
    if (isStoryType || isPhotobookType) {
      setState('ready');
      return;
    }

    // ── Resume guard (자서전 흐름 only) ──
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
  }, [router, isHelpMode, isStoryType, isPhotobookType]);

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

  // 🔥 Sprint 2d — 4가지 모드 분기 (우선순위 photobook > story > help > default):
  //   1) isPhotobookType → 사진 앨범집으로
  //   2) isStoryType     → 내 이야기책으로
  //   3) isHelpMode (자서전 ?from=book) → 자서전으로
  //   4) 그 외 (default 자서전 시작) → 홈으로
  const backLabel = isPhotobookType ? '사진 앨범집으로'
                  : isStoryType     ? '내 이야기책으로'
                  : isHelpMode      ? '자서전으로'
                  : '홈으로';
  const ctaLabel  = isPhotobookType ? '← 사진 앨범집으로 돌아가기'
                  : isStoryType     ? '← 내 이야기책으로 돌아가기'
                  : isHelpMode      ? '← 자서전으로 돌아가기'
                  : '▶ 1단계 시작하기';
  const ctaSubLabel = isPhotobookType
    ? '사진 앨범집은 자유롭게 만드세요. 위 단계는 참고용입니다.'
    : isStoryType
      ? '이야기책은 자유롭게 만드세요. 위 단계는 참고용입니다.'
      : isHelpMode
        ? '이미 자서전을 시작하셨어요. 위 단계를 참고해 주세요.'
        : '5개 시나리오 중에서 비슷한 것을 고르세요';

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button
          type="button"
          className={s.backBtn}
          onClick={() => {
            if (isPhotobookType) {
              router.push('/photobook');
              return;
            }
            if (isStoryType) {
              router.push('/my-stories');
              return;
            }
            // help 모드 (자서전): 그 책으로 정확히 복귀 (history back 보다 안정적)
            if (isHelpMode && currentBookId) {
              router.push(`/book/${currentBookId}`);
              return;
            }
            router.push('/');
          }}
          aria-label={backLabel}
        >‹</button>
        <span className={s.backLabel}>{backLabel}</span>
      </header>

      <div className={s.titleBlock}>
        <h1 className={s.title}>{titleText}</h1>
        <p className={s.intro}>{introText}</p>
      </div>

      <div className={s.steps}>
        {STEPS.map((step, i) => (
          <Fragment key={i}>
            <div className={s.step}>
              <div className={s.stepNumber}>{i + 1}</div>
              <div className={s.stepIcon}>{step.icon}</div>
              <div className={s.stepBody}>
                <div className={s.stepTitle}>{step.title}</div>
                <div className={s.stepDesc}>{step.desc}</div>
              </div>
            </div>

            {/* 🔥 Sprint 2a (2026-05-10) — 단계 사이의 진행 방향 화살표.
                양방향 (녹색 ↑↓): 1↔2, 2↔3, 3↔4 — 시니어가 자유로움.
                단방향 (주황 ↓): 4→5, 5→6 — 수정/표지/인쇄는 진행 순.
                마지막 step (6) 은 화살표 없음. */}
            {step.arrowAfter && (
              <div
                className={`${s.stepArrow} ${step.arrowAfter === 'bidirectional' ? s.bidirectional : s.forward}`}
                aria-hidden="true"
              >
                {step.arrowAfter === 'bidirectional' ? '↑↓' : '↓'}
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <button
        type="button"
        className={s.cta}
        onClick={() => {
          if (isPhotobookType) {
            router.push('/photobook');
            return;
          }
          if (isStoryType) {
            router.push('/my-stories');
            return;
          }
          // 도움말 모드 (자서전): 책으로 복귀 (이미 시작한 사용자라 1단계 다시 X)
          if (isHelpMode && currentBookId) {
            router.push(`/book/${currentBookId}`);
            return;
          }
          router.push('/architect/sample/1');
        }}
      >
        {ctaLabel}
      </button>
      <div className={s.ctaSub}>{ctaSubLabel}</div>
    </div>
  );
}
