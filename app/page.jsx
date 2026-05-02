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
    homeBtnMemoir      : '내 자서전',
    homeBtnEssay       : '내 수필집',
    homeBtnRecord      : '기록하기',
    homeBtnTalk        : '이야기하기',
    homeBtnMyStories   : '내 이야기 보기',
    homeBtnSamples     : '샘플 이야기 보기',
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
    homeBtnMemoir      : 'My Memoir',
    homeBtnEssay       : 'My Essays',
    homeBtnRecord      : 'Record',
    homeBtnTalk        : 'Talk',
    homeBtnMyStories   : 'My Stories',
    homeBtnSamples     : 'Sample Stories',
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
    homeBtnMemoir      : 'Mis memorias',
    homeBtnEssay       : 'Mis ensayos',
    homeBtnRecord      : 'Grabar',
    homeBtnTalk        : 'Hablar',
    homeBtnMyStories   : 'Mis historias',
    homeBtnSamples     : 'Historias',
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
  const memoirBook = activeBooks.find(b => b.template_category === 'memoir');
  const essayBook  = activeBooks.find(b => b.template_category === 'essays');

  function onMemoirClick() {
    if (!isLoggedIn) return requireLogin('/book/templates');
    if (memoirBook) router.push(`/book/${memoirBook.id}`);
    else router.push('/book/templates');
  }

  function onEssayClick() {
    if (!isLoggedIn) return requireLogin('/book/templates');
    if (essayBook) router.push(`/book/${essayBook.id}`);
    else router.push('/book/templates');
  }

  if (!authChecked) {
    return <div className={s.loadingScreen} />;
  }

  return (
    <div className={s.homeContainer}>
      {/* 🔥 Task 70 — Brand header. The lang pill + logout moved to a
          small footer at the bottom of the screen because seniors set
          them once and rarely touch them again. The logo gets the
          full top of the viewport instead. */}
      <div className={s.brandHeader}>
        <h1 className={s.logoLarge}>SayAndKeep.com</h1>
      </div>

      {/* Greeting */}
      {/* 🔥 Task 74 — logged-in users see "안녕하세요, <name>";
          visitors see the tagline so the / page reads as a landing
          page rather than an empty greeting. */}
      <div className={s.greetingLine}>
        {isLoggedIn ? msgs.greeting(userName) : msgs.tagline}
      </div>

      {/* 🔥 Task 83 — 2×3 square grid replaces the 5 horizontal CTAs.
          Memoir/Essay split into their own buttons; if a book of that
          template_category is already in flight we resume into it,
          otherwise the tap lands on /book/templates filtered to that
          type. */}
      {/* 🔥 Task 83 (revised) — Tim 요청: 2 columns × 3 rows. 한 줄에
          버튼 2개씩, 총 3줄. */}
      <div className={s.gridContainer}>
        <div className={s.gridRow}>
          <button
            className={`${s.gridBtn} ${s.gridBtnMemoir}`}
            onClick={onMemoirClick}
          >
            <div className={s.gridIcon}>📘</div>
            <div className={s.gridLabel}>{msgs.homeBtnMemoir}</div>
          </button>

          <button
            className={`${s.gridBtn} ${s.gridBtnEssay}`}
            onClick={onEssayClick}
          >
            <div className={s.gridIcon}>📓</div>
            <div className={s.gridLabel}>{msgs.homeBtnEssay}</div>
          </button>
        </div>

        <div className={s.gridRow}>
          <button
            className={`${s.gridBtn} ${s.gridBtnRecord}`}
            onClick={() => isLoggedIn ? router.push('/chat?mode=story') : requireLogin('/chat?mode=story')}
          >
            <div className={s.gridIcon}>🎙️</div>
            <div className={s.gridLabel}>{msgs.homeBtnRecord}</div>
          </button>

          <button
            className={`${s.gridBtn} ${s.gridBtnTalk}`}
            onClick={() => isLoggedIn ? router.push('/chat?mode=companion') : requireLogin('/chat?mode=companion')}
          >
            <div className={s.gridIcon}>💬</div>
            <div className={s.gridLabel}>{msgs.homeBtnTalk}</div>
            <span className={s.gridPrivateBadge}>🔒 {msgs.privateLabel}</span>
          </button>
        </div>

        <div className={s.gridRow}>
          <button
            className={`${s.gridBtn} ${s.gridBtnMyStories}`}
            onClick={() => isLoggedIn ? router.push('/my-stories') : requireLogin('/my-stories')}
          >
            <div className={s.gridIcon}>📖</div>
            <div className={s.gridLabel}>{msgs.homeBtnMyStories}</div>
          </button>

          <button
            className={`${s.gridBtn} ${s.gridBtnSamples}`}
            onClick={() => router.push('/sharing-stories')}
          >
            <div className={s.gridIcon}>🌐</div>
            <div className={s.gridLabel}>{msgs.homeBtnSamples}</div>
          </button>
        </div>
      </div>

      {/* 🔥 Task 83 — Footer. The book templates link was removed (the
          memoir/essay grid buttons cover the same path now). */}
      <footer className={s.homeFooter}>
        <div className={s.footerRow}>
          <button className={s.footerLangPill} onClick={toggleLang}>{lang}</button>
          {isLoggedIn ? (
            <button className={s.footerLogoutBtn} onClick={handleLogout}>{msgs.logout}</button>
          ) : (
            <button className={s.footerLogoutBtn} onClick={() => router.push('/login')}>
              {msgs.loginBtn}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
