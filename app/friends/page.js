'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CHARACTER_LIST, getCharacterLocale } from '@/lib/characters';
import AvatarEmma from '@/components/avatars/AvatarEmma';

// Warm palette (matches chat page)
const C = {
  bg:         '#FFFCF8',
  surface:    '#FFFFFF',
  border:     '#F0EBE3',
  textPrimary:'#1C1917',
  textMid:    '#78716C',
  textMuted:  '#A8A29E',
  coral:      '#F97316',
  coralLight: '#FFF3EC',
  coralBorder:'#FDBA74',
};

const UI = {
  en: {
    greeting:  (name) => `Hi, ${name}! 👋`,
    signOut:   'Sign out',
    heroTitle: 'Your AI Friend',
    heroSub:   'Emma remembers everything about you.\nEvery conversation brings you closer.',
    talkTo:    (name) => `🎙️  Talk to ${name}`,
    footer:    'ihavefriend.com — Always here for you.',
  },
  ko: {
    greeting:  (name) => `안녕하세요, ${name}! 👋`,
    signOut:   '로그아웃',
    heroTitle: '나의 AI 친구',
    heroSub:   'Emma는 당신의 모든 이야기를 기억해요.\n대화할수록 더 가까워져요.',
    talkTo:    (name) => `🎙️  ${name}와 대화하기`,
    footer:    'ihavefriend.com — 언제나 곁에 있어요.',
  },
};

export default function FriendsPage() {
  const router = useRouter();
  const [user, setUser]   = useState(null);
  const [lang, setLang]   = useState('en');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u) { router.push('/login'); return; }
    setUser(u);
    setLang(localStorage.getItem('lang') || 'en');
  }, [router]);

  function toggleLang() {
    const next = lang === 'en' ? 'ko' : 'en';
    setLang(next);
    localStorage.setItem('lang', next);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  }

  const tx = UI[lang] || UI.en;
  const userName = user?.name || user?.email?.split('@')[0] || '';

  // Only Emma in beta — remove .filter() to re-enable all characters
  const visibleChars = CHARACTER_LIST.filter(c => c.id === 'emma');

  if (!user) return <div style={{ background: C.bg, minHeight: '100vh' }} />;

  return (
    <div style={S.page}>

      {/* ── Header ──────────────────────────────────── */}
      <div style={S.header}>
        <div style={S.logo}>
          <span style={S.logoIcon}>💬</span>
          <span style={S.logoText}>ihavefriend</span>
        </div>
        <div style={S.headerRight}>
          <span style={S.greeting}>{tx.greeting(userName)}</span>
          <button style={S.langBtn} onClick={toggleLang}>
            {lang === 'en' ? '🇰🇷 한국어' : '🇺🇸 English'}
          </button>
          <button style={S.logoutBtn} onClick={handleLogout}>{tx.signOut}</button>
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────── */}
      <div style={S.hero}>
        <h1 style={S.heroTitle}>{tx.heroTitle}</h1>
        <p style={S.heroSub}>
          {tx.heroSub.split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </p>
      </div>

      {/* ── Character cards ──────────────────────────── */}
      <div style={S.cardArea}>
        {visibleChars.map((baseChar) => {
          const char = getCharacterLocale(baseChar, lang);
          return (
            <div
              key={char.id}
              style={S.card}
              onClick={() => router.push(`/chat?character=${char.id}`)}
            >
              {/* Avatar */}
              <div style={S.avatarWrap}>
                {char.id === 'emma'
                  ? <AvatarEmma size={120} isSpeaking={false} />
                  : <span style={{ fontSize: 56 }}>{char.emoji}</span>
                }
              </div>

              {/* Info */}
              <div style={S.cardBody}>
                <div style={S.charName}>{char.name}</div>
                <div style={S.charRole}>{char.role}</div>
                <div style={S.charTagline}>"{char.tagline}"</div>
                <p style={S.charDesc}>{char.description}</p>

                {/* Expertise tags */}
                <div style={S.tags}>
                  {char.expertise.map(tag => (
                    <span key={tag} style={S.tag}>{tag}</span>
                  ))}
                </div>
              </div>

              {/* CTA button */}
              <button style={S.talkBtn}>
                {tx.talkTo(char.name)}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Footer ──────────────────────────────────── */}
      <p style={S.footer}>{tx.footer}</p>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
      `}</style>
    </div>
  );
}

const S = {
  page: {
    minHeight: '100vh',
    background: C.bg,
    color: C.textPrimary,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingBottom: 60,
  },

  // Header
  header: {
    width: '100%',
    maxWidth: 720,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 24px',
    borderBottom: `1px solid ${C.border}`,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 8 },
  logoIcon: { fontSize: 22 },
  logoText: {
    fontSize: 19,
    fontWeight: 800,
    color: C.coral,
    letterSpacing: '-0.02em',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  greeting: { color: C.textMid, fontSize: 14 },
  langBtn: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
    color: C.textMid,
    fontWeight: 500,
  },
  logoutBtn: {
    background: 'none',
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
    color: C.textMuted,
  },

  // Hero
  hero: {
    textAlign: 'center',
    padding: '48px 24px 32px',
    maxWidth: 560,
  },
  heroTitle: {
    fontSize: 'clamp(30px, 6vw, 48px)',
    fontWeight: 800,
    margin: '0 0 14px',
    color: C.textPrimary,
    letterSpacing: '-0.03em',
  },
  heroSub: {
    fontSize: 16,
    color: C.textMid,
    lineHeight: 1.75,
    margin: 0,
  },

  // Card
  cardArea: {
    width: '100%',
    maxWidth: 480,
    padding: '0 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 24,
    padding: '32px 28px 24px',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    transition: 'box-shadow 0.2s ease, transform 0.2s ease',
  },

  avatarWrap: {
    width: 130,
    height: 130,
    borderRadius: '50%',
    background: C.coralLight,
    border: `3px solid ${C.coralBorder}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 20,
  },

  cardBody: { textAlign: 'center', width: '100%', marginBottom: 20 },
  charName: {
    fontSize: 26,
    fontWeight: 800,
    color: C.coral,
    letterSpacing: '-0.02em',
    marginBottom: 4,
  },
  charRole: {
    fontSize: 14,
    color: C.textMuted,
    fontWeight: 500,
    marginBottom: 10,
  },
  charTagline: {
    fontSize: 16,
    color: C.textMid,
    fontStyle: 'italic',
    lineHeight: 1.5,
    marginBottom: 12,
  },
  charDesc: {
    fontSize: 15,
    color: C.textMid,
    lineHeight: 1.7,
    margin: '0 0 16px',
  },

  tags: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  tag: {
    fontSize: 12,
    padding: '4px 12px',
    borderRadius: 20,
    background: C.coralLight,
    color: C.coral,
    fontWeight: 600,
  },

  talkBtn: {
    width: '100%',
    padding: '18px',
    background: C.coral,
    color: '#fff',
    borderRadius: 16,
    fontSize: 18,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    letterSpacing: '0.01em',
    boxShadow: `0 4px 16px ${C.coral}44`,
  },

  footer: {
    marginTop: 40,
    color: C.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
};
