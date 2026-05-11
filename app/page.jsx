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

    // 🔥 Task 87 — Terms of Service link in footer.
    termsLabel         : '서비스 약관',
    // 🔥 Sprint 2a (2026-05-10) — footer 정리:
    //   "기록하지 않기" → "Emma와 대화" (의미 명확화).
    //   "샘플 이야기" + "수필집" 제거 (메인 흐름과 무관).
    //   로그인/로그아웃은 우상단으로 이동 (footer 에서 제거).
    //   기존 키 (footerDontSave / footerSamples / footerEssays /
    //   essayComingSoon) 는 백압-호환 위해 남겨둠 — 사용처 없음.
    footerCompanion    : 'Emma와 대화',
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

    // 🔥 Task 87 — Terms of Service link in footer.
    termsLabel         : 'Terms of Service',
    // 🔥 Sprint 2a (2026-05-10) — footer cleanup; legacy keys kept.
    footerCompanion    : 'Talk with Emma',
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

    // 🔥 Task 87 — Terms of Service link in footer.
    termsLabel         : 'Términos del servicio',
    // 🔥 Sprint 2a (2026-05-10) — limpieza del footer; claves legadas se mantienen.
    footerCompanion    : 'Hablar con Emma',
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
    if (!isLoggedIn) return requireLogin('/architect');
    if (memoirBook) router.push(`/book/${memoirBook.id}`);
    else router.push('/architect');
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
      <header className={s.homeTopHeader}>
        <h1 className={s.logoSmall}>SayAndKeep.com</h1>
        {isLoggedIn ? (
          <button className={s.topAuthBtn} onClick={handleLogout}>
            {msgs.logout}
          </button>
        ) : (
          <button className={s.topAuthBtn} onClick={() => router.push('/login')}>
            {msgs.loginBtn}
          </button>
        )}
      </header>

      {/* 🔥 Sprint 2g (2026-05-11) — Hero visual: 🎙️ → 📘 (마이크 → 닫힌 책).
          Tim 의 brand 통찰: SayAndKeep 의 차별점 = 결과물 (책), 변환은
          commodity. 📘 (closed book) = "당신이 받게 될 것". 자서전 만들기
          버튼의 큰 아이콘과 동일 → brand identity 강화. 가운데 SVG 부드러운
          호 화살표가 "voice → book" 변환을 시각화. 텍스트는 한 줄 보조
          (이전 .taglineLarge 28px 큰 글씨에서 .heroTagline 16px 보조 텍스트로). */}
      <div className={s.taglineHero}>
        <div className={s.heroVisual} aria-hidden="true">
          <span className={s.heroIcon}>🎙️</span>
          <svg
            className={s.heroArrow}
            width="60"
            height="24"
            viewBox="0 0 60 24"
            fill="none"
          >
            {/* 부드러운 quadratic Bezier 곡선 (왼→오) */}
            <path
              d="M 4 14 Q 30 4, 52 14"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* 화살촉 */}
            <path
              d="M 48 10 L 52 14 L 48 18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span className={s.heroIcon}>📘</span>
        </div>
        <p className={s.heroTagline}>{msgs.brandTagline}</p>
      </div>

      {/* Greeting (small line under the tagline hero). */}
      <div className={s.greetingLine}>
        {isLoggedIn ? msgs.greeting(userName) : msgs.tagline}
      </div>

      {/* 🔥 Sprint 2a (2026-05-10) — 세로 3 버튼 (1 column × 3 rows).
          이전 2×2 grid 가 정사각 버튼 + 한 자리 비어있음으로 어색했고,
          Tim 의 mental model 은 "자서전 / 이야기책 / 사진책 — 세 가지
          책". 세로 배치로 명확하게.
          .gridRow 제거하고 버튼을 .gridContainer 에 직접 배치 (이미
          flex column gap). aspect-ratio 1/1 도 CSS 에서 풀어서 가로로
          쫙 펼쳐지는 카드가 됨. */}
      <div className={s.gridContainer}>
        <button
          className={`${s.gridBtn} ${s.gridBtnMemoir}`}
          onClick={onMemoirClick}
        >
          <div className={s.gridIcon}>📘</div>
          <div className={s.gridLabel}>{msgs.homeBtnMemoir}</div>
        </button>

        <button
          className={`${s.gridBtn} ${s.gridBtnRecord}`}
          onClick={() => isLoggedIn ? router.push('/my-stories') : requireLogin('/my-stories')}
        >
          {/* 🔥 Sprint 2a (2026-05-10) — 🎙️ → 📖. 마이크는 "녹음" 함의가
              강한데 이 버튼은 "이야기책 만들기" 라서 책 아이콘이 더 적합. */}
          <div className={s.gridIcon}>📖</div>
          <div className={s.gridLabel}>{msgs.homeBtnRecord}</div>
        </button>

        <button
          className={`${s.gridBtn} ${s.gridBtnMyStories}`}
          onClick={() => isLoggedIn ? router.push('/photobook') : requireLogin('/photobook')}
        >
          <div className={s.gridIcon}>📷</div>
          <div className={s.gridLabel}>{msgs.homeBtnPhotobook}</div>
        </button>
      </div>

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
          <button className={s.footerTermsBtn} onClick={() => router.push('/terms')}>
            {msgs.termsLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}
