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
 * 🔥 Sprint 2Y (2026-05-13) — i18n 추가 (KO / EN / ES). /pricing 의
 *   PRICING_MSGS 패턴을 그대로 적용 (영구 baseline). 자녀 → 부모 톤 일관
 *   (3 언어 모두 따뜻 + 부드러움). 한국어 텍스트 100% 보존, EN/ES 추가.
 *   STEPS 배열은 lang 별 함수 getSteps(M, type) 으로 reactive — icon /
 *   arrowAfter 는 그대로 (logic 영향 X).
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 *           STRATEGY-architect-i18n-2026-05-13.md (Sprint 2Y)
 */

import { Fragment, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import s from './page.module.css';

// ─────────────────────────────────────────────────────────────────
// useLang — /pricing 패턴 일관 (Sprint 2Y, 영구 baseline).
// ─────────────────────────────────────────────────────────────────
function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

// ─────────────────────────────────────────────────────────────────
// ARCHITECT_MSGS — 3 언어 (KO / EN / ES). Sprint 2Y.
// 자녀 → 부모 톤 영구 일관. EN/ES 도 따뜻 + 부드러움 (SaaS 톤 X).
// ─────────────────────────────────────────────────────────────────
const ARCHITECT_MSGS = {
  KO: {
    loadingMsg: '준비 중…',

    titleMemoir:    '📚 책 만들기 시작',
    titleStory:     '📖 이야기책 만들기',
    titlePhotobook: '📷 사진 앨범집 만들기',

    introMemoir:    '당신과 비슷한 인생 이야기를 골라보세요.\n그 위에 당신의 이야기를 만들어 갑시다.',
    introStory:     '이야기를 자유롭게 모으고, 나중에 책으로 묶으세요.\n어디부터 시작해도 좋아요.',
    introPhotobook: '사진 한 장에 추억 한 줄.\n가족과 함께 펼쳐볼 작은 책을 만들어요.',

    // STEPS_MEMOIR (1-3)
    stepMemoir1Title: '목차 만들기',     stepMemoir1Desc: '책의 큰 구조를 만듭니다',
    stepMemoir2Title: '소제목 만들기',   stepMemoir2Desc: '각 목차의 질문들',
    stepMemoir3Title: '이야기 만들기',   stepMemoir3Desc: '질문에 답하며 책 채우기',

    // STEPS_STORY (1-3)
    stepStory1Title: '이야기 만들기',    stepStory1Desc: 'Emma 와 대화하거나 직접 자유롭게 작성',
    stepStory2Title: '목차 만들기',      stepStory2Desc: '이야기들을 묶을 챕터를 만듭니다',
    stepStory3Title: '이야기 연결',      stepStory3Desc: '만든 이야기를 목차에 연결합니다',

    // STEPS_PHOTOBOOK (1-3)
    stepPhoto1Title: '사진 모으기',      stepPhoto1Desc: '카메라나 앨범에서 사진을 추가합니다',
    stepPhoto2Title: '이야기 쓰기',      stepPhoto2Desc: '각 사진에 짧은 이야기를 적습니다',
    stepPhoto3Title: '페이지 정리',      stepPhoto3Desc: '페이지 순서를 바꾸고 정리합니다',

    // Shared 4-5-6
    stepEditTitle:  '이야기 수정/편집',  stepEditDesc:  '직접 다듬기',
    stepCoverTitle: '표지 만들기',       stepCoverDesc: '책의 얼굴 정하기',
    stepPrintTitle: '책 인쇄',           stepPrintDesc: '완성된 책을 손에',

    // Back labels (header)
    backHome:      '홈으로',
    backPhotobook: '사진 앨범집으로',
    backStory:     '내 이야기책으로',
    backMemoir:    '자서전으로',

    // CTA labels
    ctaStart:         '▶ 1단계 시작하기',
    ctaBackPhotobook: '← 사진 앨범집으로 돌아가기',
    ctaBackStory:     '← 내 이야기책으로 돌아가기',
    ctaBackMemoir:    '← 자서전으로 돌아가기',

    // CTA sub labels
    ctaSubStart:     '5개 시나리오 중에서 비슷한 것을 고르세요',
    ctaSubPhotobook: '사진 앨범집은 자유롭게 만드세요. 위 단계는 참고용입니다.',
    ctaSubStory:     '이야기책은 자유롭게 만드세요. 위 단계는 참고용입니다.',
    ctaSubMemoir:    '이미 자서전을 시작하셨어요. 위 단계를 참고해 주세요.',

    // Pricing box
    pricingTitle:   '💰 SayAndKeep 가격',
    pricingTrial:   '🌱 Trial 무료 — 지금 바로 시작',
    pricingPremium: '📘 Premium $199 — 한국어 출시 예정',
    pricingLink:    '💰 자세히 보기',
  },

  EN: {
    loadingMsg: 'Loading…',

    titleMemoir:    '📚 Start Your Memoir',
    titleStory:     '📖 Make a Story Book',
    titlePhotobook: '📷 Make a Photo Album',

    introMemoir:    'Pick a life story like yours.\nBuild your own story on top of it.',
    introStory:     'Collect your stories freely. Later, bind them into a book.\nStart from wherever feels right.',
    introPhotobook: 'One memory per photo.\nMake a small book to open with your family.',

    stepMemoir1Title: 'Make a Table of Contents', stepMemoir1Desc: 'Build the big structure of your book',
    stepMemoir2Title: 'Add Subtitles',             stepMemoir2Desc: 'Questions for each chapter',
    stepMemoir3Title: 'Tell Your Stories',         stepMemoir3Desc: 'Fill the book by answering questions',

    stepStory1Title: 'Tell Your Stories',          stepStory1Desc: 'Talk with Emma or write freely on your own',
    stepStory2Title: 'Make a Table of Contents',   stepStory2Desc: 'Create chapters to bind your stories',
    stepStory3Title: 'Connect Your Stories',       stepStory3Desc: 'Link your stories to chapters',

    stepPhoto1Title: 'Gather Photos',              stepPhoto1Desc: 'Add photos from your camera or albums',
    stepPhoto2Title: 'Write Short Stories',        stepPhoto2Desc: 'A short memory for each photo',
    stepPhoto3Title: 'Arrange Pages',              stepPhoto3Desc: 'Reorder and organize the pages',

    stepEditTitle:  'Edit Your Stories',           stepEditDesc:  'Polish them yourself',
    stepCoverTitle: 'Design the Cover',            stepCoverDesc: 'The face of your book',
    stepPrintTitle: 'Print the Book',              stepPrintDesc: 'Hold your finished book',

    backHome:      'Home',
    backPhotobook: 'My Photo Album',
    backStory:     'My Story Book',
    backMemoir:    'My Memoir',

    ctaStart:         '▶ Start Step 1',
    ctaBackPhotobook: '← Back to My Photo Album',
    ctaBackStory:     '← Back to My Story Book',
    ctaBackMemoir:    '← Back to My Memoir',

    ctaSubStart:     'Pick one of 5 scenarios that feels close to your life',
    ctaSubPhotobook: 'Make your photo album freely. The steps above are just a guide.',
    ctaSubStory:     'Make your story book freely. The steps above are just a guide.',
    ctaSubMemoir:    'You already started your memoir. The steps above are for reference.',

    pricingTitle:   '💰 SayAndKeep Pricing',
    pricingTrial:   '🌱 Trial Free — Start now',
    pricingPremium: '📘 Premium $199 — Korean launching soon',
    pricingLink:    '💰 See details',
  },

  ES: {
    loadingMsg: 'Cargando…',

    titleMemoir:    '📚 Empieza tu Memoria',
    titleStory:     '📖 Haz un Libro de Historias',
    titlePhotobook: '📷 Haz un Álbum de Fotos',

    introMemoir:    'Elige una historia de vida parecida a la tuya.\nConstruye tu propia historia encima.',
    introStory:     'Reúne tus historias libremente. Luego, únelas en un libro.\nEmpieza por donde te sientas cómodo.',
    introPhotobook: 'Un recuerdo por foto.\nHaz un libro pequeño para abrir con tu familia.',

    stepMemoir1Title: 'Crear el Índice',           stepMemoir1Desc: 'Construye la estructura general del libro',
    stepMemoir2Title: 'Añadir Subtítulos',         stepMemoir2Desc: 'Preguntas para cada capítulo',
    stepMemoir3Title: 'Cuenta tus Historias',      stepMemoir3Desc: 'Llena el libro respondiendo a las preguntas',

    stepStory1Title: 'Cuenta tus Historias',       stepStory1Desc: 'Habla con Emma o escribe libremente por tu cuenta',
    stepStory2Title: 'Crear el Índice',            stepStory2Desc: 'Crea capítulos para unir tus historias',
    stepStory3Title: 'Conectar las Historias',     stepStory3Desc: 'Vincula tus historias a los capítulos',

    stepPhoto1Title: 'Reunir Fotos',               stepPhoto1Desc: 'Añade fotos desde tu cámara o álbumes',
    stepPhoto2Title: 'Escribir Historias Cortas',  stepPhoto2Desc: 'Un recuerdo corto para cada foto',
    stepPhoto3Title: 'Organizar Páginas',          stepPhoto3Desc: 'Reordena y organiza las páginas',

    stepEditTitle:  'Editar tus Historias',        stepEditDesc:  'Púlelas tú mismo',
    stepCoverTitle: 'Diseñar la Portada',          stepCoverDesc: 'La cara de tu libro',
    stepPrintTitle: 'Imprimir el Libro',           stepPrintDesc: 'Tu libro terminado en las manos',

    backHome:      'Inicio',
    backPhotobook: 'Mi Álbum de Fotos',
    backStory:     'Mi Libro de Historias',
    backMemoir:    'Mi Memoria',

    ctaStart:         '▶ Empezar Paso 1',
    ctaBackPhotobook: '← Volver a Mi Álbum de Fotos',
    ctaBackStory:     '← Volver a Mi Libro de Historias',
    ctaBackMemoir:    '← Volver a Mi Memoria',

    ctaSubStart:     'Elige uno de los 5 escenarios que se sienta cercano a tu vida',
    ctaSubPhotobook: 'Haz tu álbum libremente. Los pasos arriba son solo una guía.',
    ctaSubStory:     'Haz tu libro libremente. Los pasos arriba son solo una guía.',
    ctaSubMemoir:    'Ya empezaste tu memoria. Los pasos arriba son una referencia.',

    pricingTitle:   '💰 Precios SayAndKeep',
    pricingTrial:   '🌱 Trial Gratis — Empieza ahora',
    pricingPremium: '📘 Premium $199 — Coreano próximamente',
    pricingLink:    '💰 Ver detalles',
  },
};

// ─────────────────────────────────────────────────────────────────
// getSteps(M, type) — STEPS array generator (Sprint 2Y refactor).
// icon + arrowAfter 100% 보존 (logic 영향 X). title/desc 만 lang.
//
// Sprint 2a: arrowAfter ('bidirectional' / 'forward' / null).
//   1↔2 / 2↔3 / 3↔4 양방향 (시니어 자유롭게 오감).
//   4→5 / 5→6 단방향 (수정 → 표지 → 인쇄 진행 흐름 고정).
// Sprint 2c: STEPS_MEMOIR vs STEPS_STORY (top-down vs bottom-up).
// Sprint 2d: STEPS_PHOTOBOOK (photo-first). 4-5-6 공통.
// ─────────────────────────────────────────────────────────────────
function getSteps(M, type) {
  // 4-5-6 공통 (수정 / 표지 / 인쇄)
  const shared456 = [
    { icon: '✏️', title: M.stepEditTitle,  desc: M.stepEditDesc,  arrowAfter: 'forward' },
    { icon: '🎨', title: M.stepCoverTitle, desc: M.stepCoverDesc, arrowAfter: 'forward' },
    { icon: '📦', title: M.stepPrintTitle, desc: M.stepPrintDesc, arrowAfter: null },
  ];

  if (type === 'photobook') {
    return [
      { icon: '📷', title: M.stepPhoto1Title, desc: M.stepPhoto1Desc, arrowAfter: 'bidirectional' },
      { icon: '📝', title: M.stepPhoto2Title, desc: M.stepPhoto2Desc, arrowAfter: 'bidirectional' },
      { icon: '🔀', title: M.stepPhoto3Title, desc: M.stepPhoto3Desc, arrowAfter: 'bidirectional' },
      ...shared456,
    ];
  }
  if (type === 'story') {
    return [
      { icon: '🎙️', title: M.stepStory1Title, desc: M.stepStory1Desc, arrowAfter: 'bidirectional' },
      { icon: '📋', title: M.stepStory2Title, desc: M.stepStory2Desc, arrowAfter: 'bidirectional' },
      { icon: '🔗', title: M.stepStory3Title, desc: M.stepStory3Desc, arrowAfter: 'bidirectional' },
      ...shared456,
    ];
  }
  // memoir (default)
  return [
    { icon: '📋', title: M.stepMemoir1Title, desc: M.stepMemoir1Desc, arrowAfter: 'bidirectional' },
    { icon: '📝', title: M.stepMemoir2Title, desc: M.stepMemoir2Desc, arrowAfter: 'bidirectional' },
    { icon: '🎙️', title: M.stepMemoir3Title, desc: M.stepMemoir3Desc, arrowAfter: 'bidirectional' },
    ...shared456,
  ];
}

// ─────────────────────────────────────────────────────────────────
// Page wrapper + Suspense
// ─────────────────────────────────────────────────────────────────
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

// Suspense fallback. useLang() requires mounted state — Suspense
// fallback renders pre-mount, so we keep the Korean default for the
// brief flash. Inner component's checking-state spinner uses M.loadingMsg.
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
  const lang = useLang();
  const M = ARCHITECT_MSGS[lang] || ARCHITECT_MSGS.KO;

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
  // Sprint 2Y: getSteps(M, type) — lang 별 reactive (icon/arrowAfter 보존).
  const flow = isPhotobookType ? 'photobook' : isStoryType ? 'story' : 'memoir';
  const STEPS = getSteps(M, flow);
  const titleText = isPhotobookType ? M.titlePhotobook
                  : isStoryType     ? M.titleStory
                  : M.titleMemoir;
  const introText = isPhotobookType ? M.introPhotobook
                  : isStoryType     ? M.introStory
                  : M.introMemoir;

  const [state, setState]       = useState('checking'); // 'checking' | 'ready'
  const [currentBookId, setCurrentBookId] = useState(null); // help 모드에서 돌아갈 책

  useEffect(() => {
    // ── Auth gate ──
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    // 🔥 Sprint 2i (2026-05-11) — soft paywall. Anonymous 사용자도 안내
    //   페이지 보임 (login 요구 X). 가치 이해 후 CTA 시점에만 login 요구.
    //   시니어 conversion funnel: "보지 않고 가입 X" → "보고 결정" 의 영구
    //   baseline. /architect 가 open 이면 베타 link / SEO 진입도 자연스러움.
    if (!token) {
      setState('ready');
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
          router.replace(`/book/${d.book.id}/tree`);  // Milestone 5 Step 1 — V3 나무 직행
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
          <div className={s.statusMsg}>{M.loadingMsg}</div>
        </div>
      </div>
    );
  }

  // 🔥 Sprint 2d — 4가지 모드 분기 (우선순위 photobook > story > help > default):
  //   1) isPhotobookType → 사진 앨범집으로
  //   2) isStoryType     → 내 이야기책으로
  //   3) isHelpMode (자서전 ?from=book) → 자서전으로
  //   4) 그 외 (default 자서전 시작) → 홈으로
  const backLabel = isPhotobookType ? M.backPhotobook
                  : isStoryType     ? M.backStory
                  : isHelpMode      ? M.backMemoir
                  : M.backHome;
  const ctaLabel  = isPhotobookType ? M.ctaBackPhotobook
                  : isStoryType     ? M.ctaBackStory
                  : isHelpMode      ? M.ctaBackMemoir
                  : M.ctaStart;
  const ctaSubLabel = isPhotobookType ? M.ctaSubPhotobook
                    : isStoryType     ? M.ctaSubStory
                    : isHelpMode      ? M.ctaSubMemoir
                    : M.ctaSubStart;

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
              router.push(`/book/${currentBookId}/tree`);  // Milestone 5 Step 1 — V3 나무 직행
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

      {/* 🔥 Sprint 2k (2026-05-11) — 안내 페이지 마지막에 가격 박스.
          시니어가 "어떻게 작동하는지" 본 뒤 "가치 + 가격" 동시 인지.
          "💰 자세히 보기" → /pricing (anonymous open).
          🔥 Sprint 2Y (2026-05-13) — 4 strings i18n. */}
      <section className={s.pricingBox}>
        <h3 className={s.pricingTitle}>{M.pricingTitle}</h3>
        <div className={s.pricingList}>
          <div className={s.pricingItem}>{M.pricingTrial}</div>
          <div className={s.pricingItem}>{M.pricingPremium}</div>
        </div>
        <button
          type="button"
          className={s.pricingLink}
          onClick={() => router.push('/pricing')}
        >
          {M.pricingLink}
        </button>
      </section>

      <button
        type="button"
        className={s.cta}
        onClick={() => {
          // 🔥 Sprint 2i (2026-05-11) — soft paywall 의 login gate.
          //   Anonymous 사용자가 안내 페이지 본 뒤 CTA 클릭 시점에 login 요구.
          //   postLoginRedirect 에 정확한 목적지 저장해서 로그인 후 자연스럽게
          //   대상 페이지로 복귀.
          const token = typeof window !== 'undefined'
            ? localStorage.getItem('token')
            : null;
          if (!token) {
            const target = isPhotobookType ? '/photobook'
                         : isStoryType     ? '/my-stories'
                         : '/architect';   // 자서전 default: 다시 /architect 로
                                           //   (logged-in 이면 resume guard 가 처리)
            try { sessionStorage.setItem('postLoginRedirect', target); } catch {}
            router.push('/login');
            return;
          }

          // Logged-in: 기존 로직 (대상 페이지로).
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
            router.push(`/book/${currentBookId}/tree`);  // Milestone 5 Step 1 — V3 나무 직행
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
