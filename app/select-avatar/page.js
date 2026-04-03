'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AVATARS = [
  {
    id: 'lily',
    name: 'Lily',
    emoji: '🌸',
    color: '#ec4899',
    personality: 'Warm & Caring',
    description: 'A gentle and patient listener. Lily is always ready to hear your stories and offer a kind word.',
    style: 'Soft and encouraging',
  },
  {
    id: 'james',
    name: 'James',
    emoji: '🎩',
    color: '#3b82f6',
    personality: 'Wise & Friendly',
    description: 'A cheerful and wise companion. James loves sharing life wisdom and hearing about your day.',
    style: 'Calm and fatherly',
  },
  {
    id: 'sunny',
    name: 'Sunny',
    emoji: '☀️',
    color: '#f59e0b',
    personality: 'Energetic & Fun',
    description: 'Always bright and upbeat! Sunny loves jokes, stories, and keeping the conversation lively.',
    style: 'Upbeat and playful',
  },
  {
    id: 'grace',
    name: 'Grace',
    emoji: '🌿',
    color: '#10b981',
    personality: 'Calm & Thoughtful',
    description: 'A peaceful and reflective companion. Grace helps you think through life with quiet wisdom.',
    style: 'Gentle and reassuring',
  },
];

export default function SelectAvatarPage() {
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.id) { router.push('/login'); return; }
    if (user.avatarChosen) { router.push('/chat'); return; }
    setUserName(user.name?.split(' ')[0] || 'there');
  }, [router]);

  async function confirmSelection() {
    if (!selected) return;
    setLoading(true);
    const token = localStorage.getItem('token');
    const res = await fetch('/api/auth/select-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatarId: selected }),
    });
    if (res.ok) {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...user, avatarId: selected, avatarChosen: true }));
      router.push('/chat');
    }
    setLoading(false);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Hi {userName}! 👋</h1>
        <p style={styles.subtitle}>Choose your companion — someone to talk with every day</p>

        <div style={styles.grid}>
          {AVATARS.map(a => (
            <div
              key={a.id}
              style={{
                ...styles.card,
                ...(selected === a.id ? { ...styles.cardSelected, borderColor: a.color, boxShadow: `0 0 0 3px ${a.color}40, 0 8px 32px rgba(0,0,0,0.4)` } : {}),
              }}
              onClick={() => setSelected(a.id)}
            >
              <div style={{ ...styles.avatarIcon, background: `${a.color}20`, border: `2px solid ${a.color}40` }}>
                <span style={{ fontSize: 48 }}>{a.emoji}</span>
              </div>
              <h2 style={{ ...styles.avatarName, color: a.color }}>{a.name}</h2>
              <div style={styles.badge}>{a.personality}</div>
              <p style={styles.description}>{a.description}</p>
              <p style={styles.style}>Speaking style: <em>{a.style}</em></p>
              {selected === a.id && (
                <div style={{ ...styles.checkmark, color: a.color }}>✓ Selected</div>
              )}
            </div>
          ))}
        </div>

        <button
          style={{
            ...styles.btn,
            ...(selected ? {} : styles.btnDisabled),
          }}
          onClick={confirmSelection}
          disabled={!selected || loading}
        >
          {loading ? '⏳ Setting up your companion...' : selected ? `Start chatting with ${AVATARS.find(a=>a.id===selected)?.name} →` : 'Choose a companion above'}
        </button>

        <p style={styles.note}>You can always change your companion later in settings</p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)',
    padding: '40px 20px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  container: { maxWidth: 880, width: '100%' },
  title: { fontSize: 36, fontWeight: 700, color: '#e2e8f0', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 18, color: '#94a3b8', textAlign: 'center', marginBottom: 40 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 20,
    marginBottom: 36,
  },
  card: {
    background: '#16213e',
    border: '2px solid #2a2a4a',
    borderRadius: 20,
    padding: '28px 20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
    position: 'relative',
  },
  cardSelected: { background: '#1e1b4b' },
  avatarIcon: {
    width: 88,
    height: 88,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  avatarName: { fontSize: 22, fontWeight: 700, marginBottom: 8 },
  badge: {
    display: 'inline-block',
    background: 'rgba(124,58,237,0.2)',
    border: '1px solid rgba(124,58,237,0.4)',
    color: '#a855f7',
    borderRadius: 20,
    padding: '3px 12px',
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 14,
  },
  description: { fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 10 },
  style: { fontSize: 12, color: '#64748b' },
  checkmark: { marginTop: 14, fontWeight: 700, fontSize: 15 },
  btn: {
    display: 'block',
    width: '100%',
    padding: '18px',
    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    color: '#fff',
    borderRadius: 14,
    fontSize: 18,
    fontWeight: 600,
    boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
    transition: 'opacity 0.2s',
    marginBottom: 16,
  },
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  note: { textAlign: 'center', color: '#475569', fontSize: 13 },
};
