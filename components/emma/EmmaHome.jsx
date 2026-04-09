'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import EmmaAvatar from './EmmaAvatar';
import styles from './EmmaHome.module.css';

// ── topic chips per time-of-day ───────────────────────────────────────────────
const DAY_CHIPS = [
  { label: '가게 이야기',     emoji: '🏪', colorKey: 'orange' },
  { label: '감사한 것들',     emoji: '🌿', colorKey: 'green'  },
  { label: '오늘 있었던 일',  emoji: '🌍', colorKey: 'teal'   },
  { label: '마음속 이야기',   emoji: '🎵', colorKey: 'purple' },
  { label: '읽은 것, 본 것',  emoji: '📖', colorKey: 'pink'   },
];

const NIGHT_CHIPS = [
  { label: '잠이 안 와요',        emoji: '💤', colorKey: 'purple' },
  { label: '오늘의 작은 기쁨',    emoji: '✨', colorKey: 'yellow' },
  { label: '외로울 때',           emoji: '💙', colorKey: 'blue'   },
  { label: '내일이 걱정돼요',     emoji: '🕐', colorKey: 'orange' },
  { label: '그냥 얘기하고 싶어요', emoji: '🌙', colorKey: 'teal'  },
];

// ── detect day / night from system clock ─────────────────────────────────────
function getTimeMode() {
  const h = new Date().getHours();
  return h >= 6 && h < 21 ? 'day' : 'night';
}

export default function EmmaHome({ userName = '' }) {
  const router  = useRouter();
  const [mode, setMode] = useState('day');
  const [displayName, setDisplayName] = useState(userName);

  // auto-detect time mode on mount; also read userName from localStorage if not passed
  useEffect(() => {
    setMode(getTimeMode());
    if (!displayName) {
      try {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        if (u) {
          setDisplayName(u.name || u.email?.split('@')[0] || '');
        }
      } catch {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDay  = mode === 'day';
  const chips  = isDay ? DAY_CHIPS : NIGHT_CHIPS;
  const name   = displayName || '친구';

  const greeting    = isDay ? `안녕하세요, ${name}! 😊` : `잘 자고 있었나요, ${name}? 🌙`;
  const subGreeting = isDay
    ? '오늘 하루는 어땠나요?\n무슨 이야기든 편하게 해요.'
    : '밤에는 더 솔직해지는 것 같아요.\n오늘 마음은 어때요?';
  const memHint = isDay
    ? '지난번 가게 이야기가 생각나요 — 요즘 어때요?'
    : '오늘 하루 잘 마무리 되길 바랐어요.';
  const sectionLabel = isDay ? '오늘 이야기해볼까요' : '지금 마음이 어때요';

  function handleChip(chip) {
    router.push(`/chat?topic=${encodeURIComponent(chip.label)}`);
  }

  return (
    <div className={`${styles.screen} ${isDay ? styles.day : styles.night}`}>

      {/* ── top bar ── */}
      <header className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push('/')}>← 홈</button>
        <div className={styles.topCenter}>
          <span className={styles.statusDot} />
          <span className={styles.topName}>Emma</span>
        </div>
        <div className={styles.topRight}>
          {/* manual mode toggle */}
          <button
            className={styles.modeToggle}
            onClick={() => setMode(m => m === 'day' ? 'night' : 'day')}
            aria-label="낮/밤 전환"
          >
            {isDay ? '🌙' : '☀️'}
          </button>
          <span className={styles.langPill}>KO</span>
        </div>
      </header>

      {/* ── avatar header area ── */}
      <div className={styles.avatarArea}>
        <EmmaAvatar size="lg" mode={mode} className={styles.avatar} />
        {isDay && <div className={styles.warmGlow} />}
        {!isDay && <div className={styles.nightGlow} />}
      </div>

      {/* ── body ── */}
      <main className={styles.body}>

        {/* greeting */}
        <div className={styles.greetingBlock}>
          <p className={styles.greeting}>{greeting}</p>
          <p className={styles.greetingSub}>{subGreeting}</p>
        </div>

        {/* memory hint */}
        <div className={styles.memBar}>
          <span className={styles.memDot} />
          <span className={styles.memText}>{memHint}</span>
        </div>

        {/* topic chips */}
        <div>
          <p className={styles.sectionLabel}>{sectionLabel}</p>
          <div className={styles.chipsWrap}>
            {chips.map(chip => (
              <button
                key={chip.label}
                className={`${styles.chip} ${styles[`chip_${chip.colorKey}`]}`}
                onClick={() => handleChip(chip)}
              >
                <span style={{ fontSize: 14 }}>{chip.emoji}</span>
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* CTA button */}
        <button
          className={styles.ctaBtn}
          onClick={() => router.push('/chat')}
        >
          <MicIcon />
          Emma와 대화하기
        </button>

        {/* bottom links */}
        <div className={styles.bottomLinks}>
          <button className={styles.bottomLink}>🏠 홈 화면 추가</button>
          <button className={styles.bottomLink}>🔔 알림 설정</button>
        </div>

      </main>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">
      <rect x="4" y="0" width="6" height="10" rx="3" fill="white" />
      <path d="M1 8c0 3.31 2.69 6 6 6s6-2.69 6-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <line x1="7" y1="14" x2="7" y2="16" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}
