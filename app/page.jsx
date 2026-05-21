'use client';

/**
 * Main Home — Identity-First (2026-04-26 / Task 38)
 *
 * Layer 1 of 3 in the SayAndKeep funnel:
 *   /            ← (this file) Identity introduction + entry points
 *   /chat        ← Mode selection + actual conversation
 *   /my-stories  ← Full story management (tabs: stories / collections)
 *
 * Replaces the previous /friends → EmmaHome (companion identity).
 * EmmaHome.jsx is preserved unused for reference.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserPlan } from '@/components/auth/useUserPlan';
import TrialBadge from '@/components/auth/TrialBadge';
import s from './page.module.css';

// ── Localization ─────────────────────────────────────────────────
const HOME_MSGS = {
  KO: {
    greeting        : (name) => name ? `안녕하세요, ${name}` : '안녕하세요',
    introLine1      : '내 이야기를 모아 정리하고 기록하는 공간',
    introStep1      : '🎙️ 이야기하기',
    introStep2      : '📝 자동 기록',
    introStep3      : '📚 모음집 정리',
    introTagline    : '당신의 이야기를 평생 보관해요',
    startStoryBtn   : '이야기 하기',
    startStoryHint  : 'Emma가 듣고 기록해드려요',
    recentStoriesLabel: '최근 이야기',
    viewAllStories  : '나의 이야기들',
    noStoriesYet    : '아직 이야기가 없어요',
    noStoriesHint   : '첫 번째 이야기를 들려주세요',
    loading         : '불러오는 중…',
    logout          : '로그아웃',
    companionTagline: '친구와 이야기하는 기록되지 않는 공간',
    companionSubline: '친구와 대화를 나누어요',
    sharingStoriesTitle: '다른 사람 이야기 보기',
    sharingStoriesSub  : '다른 사람의 이야기에서 영감을 얻어요',
    companionCtaTitle  : '그냥 이야기하기',
    companionCtaSub    : '편하게 이야기 나눠요 (기록 안 됨)',
    storyCtaTitle      : '내 이야기 남기기',
    storyCtaSub        : 'Emma가 듣고 기록해드려요',
    bookCtaTitle       : '내 책 만들기',
    bookCtaSub         : '내 이야기를 책으로 정리해요',
    bookResumeTitle    : '이어서 만들기 — {title}',
    bookResumeSub      : '진행: {done} / {total}',
    bookDefaultTitle   : '내 자서전',
    bookTemplatesFooter: '책 템플릿 보기',
    tagline            : '내 이야기를 평생 보관하는 공간',
    loginBtn           : '로그인',
    myStoriesCtaTitle  : '내 이야기 보기',
    myStoriesCtaSub    : '지금까지 모은 이야기들',
    privateLabel       : 'Private Mode',

    // 🔥 Task 83 — short labels for the 2×3 square grid (no subtitle).
    // 🔥 Sprint 2a (2026-05-10) — Tim screenshot review:
    //   라벨 시작 emoji 제거 (큰 .gridIcon 과 중복) + "내" 제거 (군더더기).
    //   "자서전 만들기" 가 더 명확. 시니어 친화 = 명확함 > 화려함.
    homeBtnMemoir      : '자서전 만들기',
    homeBtnEssay       : '내 수필집',
    homeBtnRecord      : '이야기책 만들기',
    homeBtnTalk        : '기록하지 않기',
    homeBtnMyStories   : '내 이야기 보기',
    homeBtnSamples     : '샘플 이야기 보기',
    homeBtnPhotobook   : '사진책 만들기',
    tellStoryFromList  : '이야기 하기',

    // 🔥 Task 86 — Brand tagline directly under the logo.
    brandTagline       : '이야기하면 책이 됩니다',

    // Beta Step 4 (2026-05-21) — 시안 F 홈 재디자인.
    homeHeroTitle      : '당신의 이야기를\n한 권의 책으로 만듭니다',
    bookMemoirLabel    : '자서전',
    bookMemoirSub      : '내 인생 이야기',
    bookStoryLabel     : '이야기책',
    bookStorySub       : '자유로운 수필집',
    flowSpeak          : '말하면',
    flowWrite          : '글이 되고',
    flowBook           : '책이 됩니다',
    featVoice          : '목소리 보관',
    featFamily         : '가족과 나눔',
    motiv1             : '글재주가 없어도, 말하기만 하면 됩니다',
    motiv2             : '하루 10분, 차곡차곡 쌓이는 내 인생',
    motiv3             : '살아온 날들을, 가족에게 남기는 선물',
    motiv4             : '누구나 자기만의 책 한 권은 있습니다',

    // 🔥 Task 87 — Terms of Service link in footer.
    termsLabel         : '서비스 약관',
    // 🔥 Sprint 2a (2026-05-10) — footer 정리:
    //   "기록하지 않기" → "Emma와 대화" (의미 명확화).
    //   "샘플 이야기" + "수필집" 제거 (메인 흐름과 무관).
    //   로그인/로그아웃은 우상단으로 이동 (footer 에서 제거).
    //   기존 키 (footerDontSave / footerSamples / footerEssays /
    //   essayComingSoon) 는 백압-호환 위해 남겨둠 — 사용처 없음.
    footerCompanion    : 'Emma와 대화',
    // 🔥 Milestone 5 Step 0 (2026-05-20) — 사진책 footer 짧은 라벨.
    //   메인 grid 에서 사진책 버튼 제거 후 footer 작은 글씨로 이동.
    footerPhotobook    : '📷 사진책',
    // 🔥 Sprint 2k (2026-05-11) — 가격 페이지 link.
    footerPricing      : '💰 가격',
    footerDontSave     : '기록하지 않기',
    footerSamples      : '샘플 이야기',
    footerEssays       : '수필집',
    essayComingSoon    : '수필집은 추후 출시 예정입니다.',
  },
  EN: {
    greeting        : (name) => name ? `Hello, ${name}` : 'Hello',
    introLine1      : 'Space to listen, organize, keep every story',
    introStep1      : '🎙️ Speak',
    introStep2      : '📝 Auto-record',
    introStep3      : '📚 Organize',
    introTagline    : 'Preserve your stories for a lifetime',
    startStoryBtn   : 'Start a Story',
    startStoryHint  : 'Emma will listen and write it down for you',
    recentStoriesLabel: 'Recent Stories',
    viewAllStories  : 'My Stories',
    noStoriesYet    : 'No stories yet',
    noStoriesHint   : 'Share your first story',
    loading         : 'Loading…',
    logout          : 'Log out',
    companionTagline: 'Space to chat with a friend (not kept)',
    companionSubline: 'Have a casual chat',
    sharingStoriesTitle: "Read others' stories",
    sharingStoriesSub  : 'Find inspiration from other voices',
    companionCtaTitle  : 'Just talk',
    companionCtaSub    : 'Casual chat (nothing is kept)',
    storyCtaTitle      : 'Record my story',
    storyCtaSub        : 'Emma will listen and write it down',
    bookCtaTitle       : 'Make my book',
    bookCtaSub         : 'Turn your stories into a book',
    bookResumeTitle    : 'Continue — {title}',
    bookResumeSub      : 'Progress: {done} / {total}',
    bookDefaultTitle   : 'My Memoir',
    bookTemplatesFooter: 'Browse book templates',
    tagline            : 'A place to keep your stories for a lifetime',
    loginBtn           : 'Sign in',
    myStoriesCtaTitle  : 'View my stories',
    myStoriesCtaSub    : 'The stories you have kept so far',
    privateLabel       : 'Private Mode',

    // 🔥 Task 83 — short labels for the 2×3 square grid (no subtitle).
    // 🔥 Sprint 2a (2026-05-10) — drop leading emoji + "My" for clarity.
    homeBtnMemoir      : 'Make Memoir',
    homeBtnEssay       : 'My Essays',
    homeBtnRecord      : 'Make Story Book',
    homeBtnTalk        : "Don't Save",
    homeBtnMyStories   : 'View My Stories',
    homeBtnSamples     : 'Sample Stories',
    homeBtnPhotobook   : 'Make Photo Book',
    tellStoryFromList  : 'Tell a Story',

    // 🔥 Task 86 — Brand tagline directly under the logo.
    // 🔥 Sprint 2g (2026-05-11) — 짧은 한 줄로 통일. Hero 의 🎙️ → 📘
    //   시각이 의미 전달, 텍스트는 보조. KO/EN/ES 모두 한 줄 layout.
    brandTagline       : 'Your voice, your book.',

    // Beta Step 4 (2026-05-21) — Home redesign (variant F).
    homeHeroTitle      : 'Turn your story\ninto a book',
    bookMemoirLabel    : 'Memoir',
    bookMemoirSub      : 'My life story',
    bookStoryLabel     : 'Story Book',
    bookStorySub       : 'A free-form collection',
    // Beta Step 4 fix v2 (2026-05-21) — Tim: 모바일 한 줄 유지 위해 짧게.
    //   기존 'It becomes text' / 'It becomes a book' 가 영어에서 가로로 짤림.
    //   'Speak → To Text → Book' 으로 축약 (시니어에게도 더 명확).
    flowSpeak          : 'Speak',
    flowWrite          : 'To Text',
    flowBook           : 'Book',
    featVoice          : 'Voice kept',
    featFamily         : 'Share with family',
    motiv1             : 'No writing skill needed — just speak',
    motiv2             : '10 minutes a day, your life adds up',
    motiv3             : 'A gift of your years, left for family',
    motiv4             : 'Everyone has one book in them',

    // 🔥 Task 87 — Terms of Service link in footer.
    termsLabel         : 'Terms of Service',
    // 🔥 Sprint 2a (2026-05-10) — footer cleanup; legacy keys kept.
    footerCompanion    : 'Talk with Emma',
    footerPhotobook    : '📷 Photo Book',
    footerPricing      : '💰 Pricing',
    footerDontSave     : "Don't Save Mode",
    footerSamples      : 'Sample Stories',
    footerEssays       : 'Essays',
    essayComingSoon    : 'Essays coming soon.',
  },
  ES: {
    greeting        : (name) => name ? `Hola, ${name}` : 'Hola',
    introLine1      : 'Espacio para escuchar, organizar y guardar cada historia',
    introStep1      : '🎙️ Hablar',
    introStep2      : '📝 Grabar',
    introStep3      : '📚 Organizar',
    introTagline    : 'Conserva tus historias para toda la vida',
    startStoryBtn   : 'Contar una historia',
    startStoryHint  : 'Emma te escuchará y lo escribirá por ti',
    recentStoriesLabel: 'Historias recientes',
    viewAllStories  : 'Mis historias',
    noStoriesYet    : 'Aún no hay historias',
    noStoriesHint   : 'Comparte tu primera historia',
    loading         : 'Cargando…',
    logout          : 'Cerrar sesión',
    companionTagline: 'Espacio para charlar con un amigo (no se guarda)',
    companionSubline: 'Conversa de forma casual',
    sharingStoriesTitle: 'Leer historias de otros',
    sharingStoriesSub  : 'Inspírate con otras voces',
    companionCtaTitle  : 'Solo charlar',
    companionCtaSub    : 'Charla casual (no se guarda)',
    storyCtaTitle      : 'Grabar mi historia',
    storyCtaSub        : 'Emma escuchará y la registrará',
    bookCtaTitle       : 'Hacer mi libro',
    bookCtaSub         : 'Convierte tus historias en un libro',
    bookResumeTitle    : 'Continuar — {title}',
    bookResumeSub      : 'Progreso: {done} / {total}',
    bookDefaultTitle   : 'Mis memorias',
    bookTemplatesFooter: 'Ver plantillas de libros',
    tagline            : 'Un lugar para guardar tus historias para toda la vida',
    loginBtn           : 'Iniciar sesión',
    myStoriesCtaTitle  : 'Ver mis historias',
    myStoriesCtaSub    : 'Las historias que has guardado',
    privateLabel       : 'Modo Privado',

    // 🔥 Task 83 — short labels for the 2×3 square grid (no subtitle).
    // 🔥 Sprint 2a (2026-05-10) — sin emoji + sin "Mi" para claridad.
    homeBtnMemoir      : 'Crear Memorias',
    homeBtnEssay       : 'Mis ensayos',
    homeBtnRecord      : 'Crear Libro de Historias',
    homeBtnTalk        : 'Sin guardar',
    homeBtnMyStories   : 'Ver mis historias',
    homeBtnSamples     : 'Historias de ejemplo',
    homeBtnPhotobook   : 'Crear Libro de Fotos',
    tellStoryFromList  : 'Contar una historia',

    // 🔥 Task 86 — Brand tagline directly under the logo.
    // 🔥 Sprint 2g (2026-05-11) — frase corta, en una sola línea.
    brandTagline       : 'Tu voz, tu libro.',

    // Beta Step 4 (2026-05-21) — Rediseño del inicio (variante F).
    homeHeroTitle      : 'Convierte tu historia\nen un libro',
    bookMemoirLabel    : 'Memorias',
    bookMemoirSub      : 'La historia de mi vida',
    bookStoryLabel     : 'Libro de historias',
    bookStorySub       : 'Una colección libre',
    // Beta Step 4 fix v2 (2026-05-21) — Tim: 1 línea en móvil, más corto.
    flowSpeak          : 'Habla',
    flowWrite          : 'A texto',
    flowBook           : 'Libro',
    featVoice          : 'Voz guardada',
    featFamily         : 'Comparte con familia',
    motiv1             : 'Sin saber escribir — solo habla',
    motiv2             : '10 minutos al día, tu vida suma',
    motiv3             : 'Un regalo de tus años, para tu familia',
    motiv4             : 'Todos tienen un libro dentro',

    // 🔥 Task 87 — Terms of Service link in footer.
    termsLabel         : 'Términos del servicio',
    // 🔥 Sprint 2a (2026-05-10) — limpieza del footer; claves legadas se mantienen.
    footerCompanion    : 'Hablar con Emma',
    footerPhotobook    : '📷 Álbum',
    footerPricing      : '💰 Precios',
    footerDontSave     : 'Modo sin guardar',
    footerSamples      : 'Historias de ejemplo',
    footerEssays       : 'Ensayos',
    essayComingSoon    : 'Ensayos próximamente.',
  },
};

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return [lang, setLang];
}

export default function Home() {
  const router = useRouter();
  const [lang, setLang] = useLang();
  const [userName, setUserName] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  // 🔥 Sprint 2j V2 (2026-05-11) — TrialBadge data. Hook is no-op for
  //   anonymous users (returns plan=null), so safe to call unconditionally.
  const { plan } = useUserPlan();
  // 🆕 Stage 7 — surface in-progress books on the home page so the
  //   senior can resume in one tap (Task 83 routes them through the
  //   memoir / essay grid buttons by template_category).
  const [activeBooks, setActiveBooks] = useState([]);

  const msgs = HOME_MSGS[lang] || HOME_MSGS.KO;

  // 🔥 Task 74 — soft paywall. The home is now PUBLIC: anyone can
  //   land here, see the tagline, browse the layout, and click into
  //   "Read others' stories" without a token. Protected CTAs (record,
  //   chat, my-stories, books) call requireLogin() which stashes the
  //   target path in sessionStorage and routes to /login. /login then
  //   bounces them back to that path on success.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token   = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user?.name || '');
        setIsLoggedIn(true);
      } catch { /* fall through to logged-out */ }
    }
    setAuthChecked(true);
  }, []);

  // Stash the target path and route to /login. /login will pick the
  // path up from sessionStorage on success and replace().
  function requireLogin(targetPath) {
    if (typeof window !== 'undefined' && targetPath) {
      try { sessionStorage.setItem('postLoginRedirect', targetPath); } catch {}
    }
    router.push('/login');
  }

  // 🆕 Stage 7 — pull in-progress books for the resume banner.
  //   Fire-and-forget; failures just leave the banner empty.
  //   Task 74: only fires for logged-in users; the public landing
  //   never sees the resume cards.
  useEffect(() => {
    if (!authChecked || !isLoggedIn) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    let cancelled = false;
    fetch('/api/book/list', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { books: [] })
      .then(d => {
        if (cancelled) return;
        const inProgress = (d.books || []).filter(b => b.status === 'in_progress');
        setActiveBooks(inProgress);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authChecked, isLoggedIn]);

  function toggleLang() {
    const order = ['KO', 'EN', 'ES'];
    const idx = order.indexOf(lang);
    const next = order[(idx + 1) % order.length];
    setLang(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('lang', next.toLowerCase());
    }
  }

  function handleLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    // Task 74: stay on the (now-public) home rather than bouncing to
    // /login — the senior just wanted to sign out, not "do something
    // that needed login".
    setIsLoggedIn(false);
    setUserName('');
    setActiveBooks([]);
  }

  // 🔥 Task 83 — classify in-progress books by template_category so the
  //   Memoir / Essay buttons resume into an existing book when one is
  //   in flight, instead of always landing on /book/templates. The
  //   /api/book/list response already JOINs book_template_definitions
  //   and exposes `template_category` ('memoir' | 'essays' | …).
  //
  // 🔥 Architect Bot V2 (2026-05-09) — first-time memoir flow now goes to
  //   /architect (6-step overview + 5 sample picker) instead of the
  //   deprecated /book/templates. Resume path (memoirBook exists) keeps
  //   landing on /book/[id]. Tim's policy: "유저는 하나의 자서전" —
  //   /architect itself does a current-book guard and bounces resume
  //   cases automatically; the memoir button just owns the entry choice.
  const memoirBook = activeBooks.find(b => b.template_category === 'memoir');
  // const essayBook  = activeBooks.find(b => b.template_category === 'essays');
  // 🔥 V2 (2026-05-09) — essay button removed pending Tim's layout
  //   decision; commenting out (not deleting) so we can flip it back
  //   without git archaeology if needed.

  function onMemoirClick() {
    // 🔥 Sprint 2i (2026-05-11) — soft paywall. Anonymous 사용자도
    //   /architect 안내 페이지 진입 가능 — 6단계 시각화로 가치 이해 후
    //   "▶ 1단계 시작하기" 클릭 시 login 요구. 시니어 conversion funnel:
    //   "보고 결정" > "보지 않고 가입".
    // 🔥 Milestone 5 Step 0 (2026-05-20) — V3 진입 3-way 분기.
    //   로그인 + 진행 중 책 있음 → 바로 챕터 나무.
    //   로그인 + 책 없음 → 안내 건너뛰고 시나리오 선택 (이미 가치 이해함).
    //   비로그인 → /architect 안내 페이지 (가치 이해 후 CTA → login).
    if (isLoggedIn && memoirBook) {
      // Milestone 5 Step 1 — 챕터 나무 (V3) 직행. /book/[id] 는 V2 리스트.
      router.push(`/book/${memoirBook.id}/tree`);
      return;
    }
    if (isLoggedIn) {
      // 로그인 + 책 없음 → 시나리오 선택 직행. /architect/sample/1 자체에
      //   resume guard 있어 책 생기면 자동 /book/[id] 로.
      router.push('/architect/sample/1');
      return;
    }
    router.push('/architect');
  }

  // function onEssayClick() {
  //   if (!isLoggedIn) return requireLogin('/architect');
  //   if (essayBook) router.push(`/book/${essayBook.id}`);
  //   else router.push('/architect');
  // }

  if (!authChecked) {
    return <div className={s.loadingScreen} />;
  }

  return (
    <div className={s.homeContainer}>
      {/* 🔥 Sprint 2a (2026-05-10) — Top header: small logo on the
          left, login/logout on the right. The big tagline that
          previously dominated the brand header moves to its own
          .taglineHero block below so it can read as the page's
          leading message instead of being a subtitle to the logo. */}
      {/* Beta Step 4 (2026-05-21) — 시안 F: 상단 logoSmall 제거 (큰 brand 로고가 아래 brandHero 로 이동).
          상단 헤더는 trial 배지 + 로그인/로그아웃만 우측에. 빈 좌측은 시각 균형 위해 spacer 1개. */}
      {/* Beta Step 4 fix (2026-05-21) — Tim: 로그아웃 버튼이 혼자 위에 떠 있던 문제.
          큰 SayAndKeep 로고를 상단 헤더 좌측으로 옮겨 로그아웃과 같은 줄에 배치.
          타이틀만 아래 brandHero 에 남김. */}
      <header className={s.homeTopHeader}>
        <div className={s.brandLogo}>SayAndKeep</div>
        <div className={s.topRight}>
          {/* 🔥 Sprint 2j V2 — Trial 사용자만 보이는 배지 (분 남음 · 이야기 N/M). */}
          {plan && plan.isTrial && <TrialBadge plan={plan} />}
          {isLoggedIn ? (
            <button className={s.topAuthBtn} onClick={handleLogout}>
              {msgs.logout}
            </button>
          ) : (
            <button className={s.topAuthBtn} onClick={() => router.push('/login')}>
              {msgs.loginBtn}
            </button>
          )}
        </div>
      </header>

      {/* Beta Step 4 (2026-05-21) — 시안 F 홈 재디자인.
          이전 taglineHero(heroCard) + greetingLine + gridContainer 를 brand 로고 +
          타이틀 + 두 책(floating) + 흐름 + 부가기능 + 동기부여 4문구 로 교체.
          기존 로직 (onMemoirClick 3-way, 이야기책 2-way) 유지 — JSX 만 새 구조. */}

      {/* 브랜드 — 타이틀 (로고는 상단 헤더로 이동) */}
      <div className={s.brandHero}>
        <h2 className={s.heroTitle}>{msgs.homeHeroTitle}</h2>
      </div>

      {/* 두 책 — 시작 버튼 (floating 애니메이션, hover 정지) */}
      <div className={s.booksRow}>
        <span className={`${s.heroSparkle} ${s.sparkle1}`} aria-hidden="true">✨</span>
        <button
          type="button"
          className={`${s.bookCard} ${s.bookMemoir}`}
          onClick={onMemoirClick}
          aria-label={msgs.bookMemoirLabel}
        >
          <span className={s.bookIcon} aria-hidden="true">🪶</span>
          <span className={s.bookLabel}>{msgs.bookMemoirLabel}</span>
          <span className={s.bookSub}>{msgs.bookMemoirSub}</span>
        </button>
        <button
          type="button"
          className={`${s.bookCard} ${s.bookStory}`}
          onClick={() => isLoggedIn
            ? router.push('/my-stories')
            : router.push('/architect?type=story&from=stories')}
          aria-label={msgs.bookStoryLabel}
        >
          <span className={s.bookIcon} aria-hidden="true">📓</span>
          <span className={s.bookLabel}>{msgs.bookStoryLabel}</span>
          <span className={s.bookSub}>{msgs.bookStorySub}</span>
        </button>
        <span className={`${s.heroSparkle} ${s.sparkle2}`} aria-hidden="true">✨</span>
      </div>

      {/* 흐름 — 말하면 → 글이 되고 → 책이 됩니다 */}
      <div className={s.flowRow}>
        <span className={s.flowItem}><span className={s.flowEmoji} aria-hidden="true">🎤</span>{msgs.flowSpeak}</span>
        <span className={s.flowArrow} aria-hidden="true">→</span>
        <span className={s.flowItem}><span className={s.flowEmoji} aria-hidden="true">📄</span>{msgs.flowWrite}</span>
        <span className={s.flowArrow} aria-hidden="true">→</span>
        <span className={s.flowItem}><span className={s.flowEmoji} aria-hidden="true">📖</span>{msgs.flowBook}</span>
      </div>

      {/* 부가기능 — 구분선 위/아래 */}
      <div className={s.featRow}>
        <span className={s.featItem}><span className={s.featEmoji} aria-hidden="true">🔊</span>{msgs.featVoice}</span>
        <span className={s.featDot} aria-hidden="true">·</span>
        <span className={s.featItem}><span className={s.featEmoji} aria-hidden="true">👥</span>{msgs.featFamily}</span>
      </div>

      {/* 동기부여 문구 4개 (아이콘 + 중앙) */}
      <ul className={s.motivList}>
        <li className={s.motivItem}><span className={s.motivEmoji} aria-hidden="true">🎤</span>{msgs.motiv1}</li>
        <li className={s.motivItem}><span className={s.motivEmoji} aria-hidden="true">⏰</span>{msgs.motiv2}</li>
        <li className={s.motivItem}><span className={s.motivEmoji} aria-hidden="true">❤️</span>{msgs.motiv3}</li>
        <li className={s.motivItem}><span className={s.motivEmoji} aria-hidden="true">📚</span>{msgs.motiv4}</li>
      </ul>

      {/* 🔥 Sprint 2a (2026-05-10) — Footer 정리:
            제거: 샘플 이야기, 수필집, 로그인/로그아웃 (상단으로 이동)
            변경: "기록하지 않기" → "Emma와 대화" (의미 명확화)
            남김: KO | Emma와 대화 | 서비스 약관 (3 항목) */}
      <footer className={s.homeFooter}>
        <div className={s.footerRow}>
          <button className={s.footerLangPill} onClick={toggleLang}>{lang}</button>
          <button
            className={s.footerTermsBtn}
            onClick={() => isLoggedIn ? router.push('/chat?mode=companion') : requireLogin('/chat?mode=companion')}
          >
            {msgs.footerCompanion}
          </button>
          {/* 🔥 Milestone 5 Step 0 (2026-05-20) — 사진책 footer 작은 글씨 (메인 grid 에서 이동). */}
          <button
            className={s.footerTermsBtn}
            onClick={() => isLoggedIn
              ? router.push('/photobook')
              : router.push('/architect?type=photobook&from=photobook')}
          >
            {msgs.footerPhotobook}
          </button>
          {/* 🔥 Sprint 2k (2026-05-11) — /pricing 페이지 link. Anonymous open. */}
          <button className={s.footerTermsBtn} onClick={() => router.push('/pricing')}>
            {msgs.footerPricing}
          </button>
          <button className={s.footerTermsBtn} onClick={() => router.push('/terms')}>
            {msgs.termsLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}
