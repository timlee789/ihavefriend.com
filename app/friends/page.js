'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CHARACTER_LIST } from '@/lib/characters';

export default function FriendsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u) { router.push('/login'); return; }
    setUser(u);
  }, [router]);

  function handleSelect(characterId) {
    router.push(`/chat?character=${characterId}`);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  }

  if (!user) return <div style={{ background: '#080b14', minHeight: '100vh' }} />;

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logoWrap}>
          <span style={S.logoIcon}>💬</span>
          <span style={S.logoText}>ihavefriend</span>
        </div>
        <div style={S.headerRight}>
          <span style={S.greeting}>Hello, {user.name || user.email.split('@')[0]} 👋</span>
          <button style={S.logoutBtn} onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      {/* Hero text */}
      <div style={S.hero}>
        <h1 style={S.heroTitle}>Choose your friend</h1>
        <p style={S.heroSub}>
          Each friend has their own personality and expertise.<br />
          Your conversations with each one are remembered separately.
        </p>
      </div>

      {/* Friend cards */}
      <div style={S.grid}>
        {CHARACTER_LIST.map((char) => {
          const isHovered = hoveredId === char.id;
          return (
            <div
              key={char.id}
              style={{
                ...S.card,
                background: char.colors.card,
                boxShadow: isHovered
                  ? `0 0 40px ${char.colors.glow}55, 0 20px 60px rgba(0,0,0,0.5)`
                  : '0 8px 32px rgba(0,0,0,0.4)',
                transform: isHovered ? 'translateY(-6px) scale(1.02)' : 'translateY(0) scale(1)',
              }}
              onMouseEnter={() => setHoveredId(char.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => handleSelect(char.id)}
            >
              {/* Emoji avatar */}
              <div style={S.emojiWrap}>
                <div style={{
                  ...S.emojiCircle,
                  border: `2px solid ${char.colors.accent}44`,
                  boxShadow: isHovered ? `0 0 24px ${char.colors.glow}66` : 'none',
                }}>
                  <span style={S.emoji}>{char.emoji}</span>
                </div>
              </div>

              {/* Name & role */}
              <div style={S.cardMid}>
                <div style={{ ...S.charName, color: char.colors.accent }}>{char.name}</div>
                <div style={S.charRole}>{char.role}</div>
                <div style={S.charAge}>{char.age} · {char.origin}</div>
              </div>

              {/* Tagline */}
              <div style={S.tagline}>"{char.tagline}"</div>

              {/* Description */}
              <p style={S.desc}>{char.description}</p>

              {/* Expertise tags */}
              <div style={S.tags}>
                {char.expertise.map((tag) => (
                  <span key={tag} style={{ ...S.tag, borderColor: `${char.colors.accent}44`, color: char.colors.accent }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Talk button */}
              <button
                style={{
                  ...S.talkBtn,
                  background: isHovered
                    ? `linear-gradient(135deg, ${char.colors.accent}dd, ${char.colors.accent})`
                    : `linear-gradient(135deg, ${char.colors.accent}66, ${char.colors.accent}88)`,
                  boxShadow: isHovered ? `0 4px 20px ${char.colors.glow}66` : 'none',
                }}
              >
                💬 &nbsp;Talk to {char.name}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <p style={S.footerText}>ihavefriend.com — Your AI companions, always here.</p>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0d0d1a; }
        ::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }
      `}</style>
    </div>
  );
}

const S = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #080b14 0%, #0d1020 50%, #080b14 100%)',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    paddingBottom: 60,
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 32px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(0,0,0,0.3)',
    backdropFilter: 'blur(10px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  logoIcon: { fontSize: 24 },
  logoText: {
    fontSize: 20,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #a78bfa, #38bdf8)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-0.02em',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  greeting: { color: '#94a3b8', fontSize: 14 },
  logoutBtn: {
    background: 'rgba(255,255,255,0.06)',
    color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },

  hero: {
    textAlign: 'center',
    padding: '60px 20px 40px',
  },
  heroTitle: {
    fontSize: 'clamp(32px, 5vw, 52px)',
    fontWeight: 700,
    margin: '0 0 16px',
    background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-0.02em',
  },
  heroSub: {
    fontSize: 16,
    color: '#64748b',
    lineHeight: 1.7,
    margin: 0,
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 24,
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
  },

  card: {
    borderRadius: 24,
    padding: '32px 28px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  emojiWrap: { display: 'flex', justifyContent: 'center' },
  emojiCircle: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'box-shadow 0.3s ease',
  },
  emoji: { fontSize: 36 },

  cardMid: { textAlign: 'center' },
  charName: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    marginBottom: 4,
  },
  charRole: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: 500,
    marginBottom: 4,
  },
  charAge: {
    fontSize: 12,
    color: '#475569',
  },

  tagline: {
    fontSize: 14,
    color: '#cbd5e1',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 1.5,
  },

  desc: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 1.6,
    margin: 0,
    textAlign: 'center',
  },

  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  tag: {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 20,
    border: '1px solid',
    background: 'rgba(0,0,0,0.2)',
    fontWeight: 500,
  },

  talkBtn: {
    width: '100%',
    padding: '14px',
    color: '#fff',
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginTop: 4,
  },

  footer: {
    textAlign: 'center',
    padding: '40px 20px 0',
  },
  footerText: {
    color: '#334155',
    fontSize: 13,
    margin: 0,
  },
};
