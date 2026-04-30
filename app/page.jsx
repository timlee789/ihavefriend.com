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
import EmmaAvatar from '@/components/emma/EmmaAvatar';
import { titleOf } from '@/lib/i18nHelper';
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
  const [isDark, setIsDark] = useState(false);
  // Task 55: recent stories card removed in favor of a dedicated
  // "내 이야기 보기" button. The fragments fetch + state are gone too.
  // 🆕 Stage 7 — surface in-progress books on the home page so the
  //   senior can resume in one tap instead of digging through the
  //   "🎙️ 내 이야기 남기기" branch every time.
  const [activeBooks, setActiveBooks] = useState([]);

  // Track system color scheme for EmmaAvatar mode
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    const handler = (e) => setIsDark(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);

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

      {/* 🔥 Task 70 — Button order. Book first (resume / make), then
          the two chat modes, then library. */}

      {/* 🔥 Task 72 — show every active book (capped at 3 to stay
          within the iPhone-SE viewport budget for the 6-button row).
          Each card jumps straight to that book; if there are zero
          active books we fall back to the "Make my book" single
          button that lands on /book/templates. */}
      {activeBooks.length === 0 ? (
        <button
          className={s.bookCta}
          onClick={() => router.push('/book/templates')}
        >
          {/* /book/templates is also public (Task 74) — visitors can
              browse the cards; the actual "start" tap there is what
              triggers the login prompt. */}
          <div className={s.ctaIcon}>📚</div>
          <div className={s.ctaTextWrap}>
            <div className={s.ctaMain}>{msgs.bookCtaTitle}</div>
            <div className={s.ctaSub}>{msgs.bookCtaSub}</div>
          </div>
        </button>
      ) : (
        activeBooks.slice(0, 3).map(b => {
          // Task 69 — prefer the template's localized name so the
          // resume label reads "Continue — My Memoir" in EN even on
          // a book that was started under memoir-ko.
          const title =
            titleOf(b.template_name, lang.toLowerCase()) ||
            b.title ||
            msgs.bookDefaultTitle;
          const done  = b.completed_questions || 0;
          const total = b.total_questions || 0;
          return (
            <button
              key={b.id}
              className={s.bookCta}
              onClick={() => router.push(`/book/${b.id}`)}
            >
              <div className={s.ctaIcon}>📚</div>
              <div className={s.ctaTextWrap}>
                <div className={s.ctaMain}>
                  {msgs.bookResumeTitle.replace('{title}', title)}
                </div>
                <div className={s.ctaSub}>
                  {msgs.bookResumeSub.replace('{done}', done).replace('{total}', total)}
                </div>
              </div>
            </button>
          );
        })
      )}

      {/* 2. Story CTA — direct /chat?mode=story */}
      <button
        className={s.storyCta}
        onClick={() => isLoggedIn ? router.push('/chat?mode=story') : requireLogin('/chat?mode=story')}
      >
        <div className={s.ctaIcon}>🎙️</div>
        <div className={s.ctaTextWrap}>
          <div className={s.ctaMain}>{msgs.storyCtaTitle}</div>
          <div className={s.ctaSub}>{msgs.storyCtaSub}</div>
        </div>
      </button>

      {/* 3. Companion CTA — Private chat */}
      <button
        className={s.companionCta}
        onClick={() => isLoggedIn ? router.push('/chat?mode=companion') : requireLogin('/chat?mode=companion')}
      >
        <div className={s.ctaIcon}>💬</div>
        <div className={s.ctaTextWrap}>
          <div className={s.ctaMain}>{msgs.companionCtaTitle}</div>
          <div className={s.ctaSub}>{msgs.companionCtaSub}</div>
        </div>
        <span className={s.privateBadge}>🔒 {msgs.privateLabel}</span>
      </button>

      {/* 4. My Stories */}
      <button
        className={s.myStoriesCta}
        onClick={() => isLoggedIn ? router.push('/my-stories') : requireLogin('/my-stories')}
      >
        <div className={s.ctaIcon}>📖</div>
        <div className={s.ctaTextWrap}>
          <div className={s.ctaMain}>{msgs.myStoriesCtaTitle}</div>
          <div className={s.ctaSub}>{msgs.myStoriesCtaSub}</div>
        </div>
      </button>

      {/* 5. Other people's stories */}
      <button
        className={s.viewStoriesCta}
        onClick={() => router.push('/sharing-stories')}
      >
        <div className={s.ctaIcon}>🌐</div>
        <div className={s.ctaTextWrap}>
          <div className={s.ctaMain}>{msgs.sharingStoriesTitle}</div>
          <div className={s.ctaSub}>{msgs.sharingStoriesSub}</div>
        </div>
      </button>

      {/* 🔥 Task 70 — Footer. lang toggle + logout demoted to a small
          row at the bottom of the screen (margin-top:auto pushes it
          there). Opacity 0.65 by default so they don't compete with
          the primary CTAs above. */}
      <footer className={s.homeFooter}>
        {/* 🔥 Task 71 — book templates link, always present so the
            senior can discover other book types beyond whatever's
            currently showing on the bookCta above. */}
        <button
          className={s.footerTemplatesBtn}
          onClick={() => router.push('/book/templates')}
        >
          📚 {msgs.bookTemplatesFooter}
        </button>
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
