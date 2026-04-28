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
    sharingStoriesTitle: '이야기 보기',
    sharingStoriesSub  : '다른 사람의 이야기들',
    companionCtaTitle  : '그냥 이야기하기',
    companionCtaSub    : '편하게 이야기 나눠요 (기록 안 됨)',
    storyCtaTitle      : '내 이야기 남기기',
    storyCtaSub        : 'Emma가 듣고 기록해드려요',
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
    sharingStoriesTitle: 'View Stories',
    sharingStoriesSub  : "Other people's stories",
    companionCtaTitle  : 'Just talk',
    companionCtaSub    : 'Casual chat (nothing is kept)',
    storyCtaTitle      : 'Record my story',
    storyCtaSub        : 'Emma will listen and write it down',
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
    sharingStoriesTitle: 'Ver historias',
    sharingStoriesSub  : 'Historias de otras personas',
    companionCtaTitle  : 'Solo charlar',
    companionCtaSub    : 'Charla casual (no se guarda)',
    storyCtaTitle      : 'Grabar mi historia',
    storyCtaSub        : 'Emma escuchará y la registrará',
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
  const [recentStories, setRecentStories] = useState([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);

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

  // Auth check + user name from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      router.replace('/login');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      setUserName(user?.name || '');
    } catch {
      router.replace('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  // Load 12 most-recent stories (root only — API returns roots by default)
  useEffect(() => {
    if (!authChecked) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    let cancelled = false;
    fetch('/api/fragments?limit=12&status=draft,confirmed', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { fragments: [] })
      .then(data => {
        if (cancelled) return;
        setRecentStories(Array.isArray(data?.fragments) ? data.fragments : []);
        setStoriesLoading(false);
      })
      .catch(() => { if (!cancelled) setStoriesLoading(false); });
    return () => { cancelled = true; };
  }, [authChecked]);

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
    router.replace('/login');
  }

  if (!authChecked) {
    return <div className={s.loadingScreen} />;
  }

  return (
    <div className={s.homeContainer}>
      {/* Header */}
      <header className={s.homeHeader}>
        <span className={s.logo}>SayAndKeep.com</span>
        <div className={s.headerRight}>
          <button className={s.langPill} onClick={toggleLang}>
            {lang}
          </button>
          <button className={s.logoutBtn} onClick={handleLogout}>
            {msgs.logout}
          </button>
        </div>
      </header>

      {/* Greeting */}
      <div className={s.greetingLine}>{msgs.greeting(userName)}</div>

      {/* Mode-specific CTAs (Task 49) — split the single "이야기 하기" button
          into two so users can pick companion vs story up front. /chat
          auto-skips its mode-selection screen when ?mode= is present. */}
      <button
        className={s.companionCta}
        onClick={() => router.push('/chat?mode=companion')}
      >
        <div className={s.ctaIcon}>💬</div>
        <div className={s.ctaTextWrap}>
          <div className={s.ctaMain}>{msgs.companionCtaTitle}</div>
          <div className={s.ctaSub}>{msgs.companionCtaSub}</div>
        </div>
      </button>

      <button
        className={s.storyCta}
        onClick={() => router.push('/chat?mode=story')}
      >
        <div className={s.ctaIcon}>🎙️</div>
        <div className={s.ctaTextWrap}>
          <div className={s.ctaMain}>{msgs.storyCtaTitle}</div>
          <div className={s.ctaSub}>{msgs.storyCtaSub}</div>
        </div>
      </button>

      {/* View Stories CTA — promoted to a full-size CTA mirroring Primary CTA
          shape, with a purple gradient to contrast against the orange (Task 48 #3) */}
      <button
        className={s.viewStoriesCta}
        onClick={() => router.push('/sharing-stories')}
      >
        <div className={s.ctaIcon}>📖</div>
        <div className={s.ctaTextWrap}>
          <div className={s.ctaMain}>{msgs.sharingStoriesTitle}</div>
          <div className={s.ctaSub}>{msgs.sharingStoriesSub}</div>
        </div>
      </button>

      {/* Recent Stories card (entire card → /my-stories) */}
      <button
        className={s.recentStoriesCard}
        onClick={() => router.push('/my-stories')}
      >
        <div className={s.viewAllLabel}>{msgs.viewAllStories}</div>

        <div className={s.recentDivider} />

        <div className={s.recentStoriesLabel}>
          📖 {msgs.recentStoriesLabel}
        </div>

        <div className={s.recentStoriesList}>
          {storiesLoading ? (
            <div className={s.recentEmpty}>{msgs.loading}</div>
          ) : recentStories.length === 0 ? (
            <div className={s.recentEmpty}>
              <div>{msgs.noStoriesYet}</div>
              <div className={s.recentEmptyHint}>{msgs.noStoriesHint}</div>
            </div>
          ) : (
            recentStories.map(f => (
              <div key={f.id} className={s.recentStoryItem}>
                <span className={s.recentStoryIcon}>📄</span>
                <span className={s.recentStoryTitle}>{f.title}</span>
              </div>
            ))
          )}
        </div>
      </button>
    </div>
  );
}
