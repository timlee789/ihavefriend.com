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

// ── language cycle: EN → KO → ES ─────────────────────────────────────────────
const LANGS = ['EN', 'KO', 'ES'];

const GREETINGS = {
  EN: {
    day:       (n) => `Hello, ${n}! 😊`,
    night:     (n) => `Still up, ${n}? 🌙`,
    sub_day:   'How was your day?\nFeel free to share anything.',
    sub_night: 'Nights make us more honest.\nHow are you feeling?',
    memHint_day:   'I remember our shop talk — how are things lately?',
    memHint_night: 'I hope today ended on a good note.',
    section_day:   'What shall we talk about',
    section_night: 'How is your heart right now',
    cta: 'Talk with Emma',
    home: 'Add to Home Screen',
    notif: 'Notification Settings',
    back: '← Home',
  },
  KO: {
    day:       (n) => `안녕하세요, ${n}! 😊`,
    night:     (n) => `잘 자고 있었나요, ${n}? 🌙`,
    sub_day:   '오늘 하루는 어땠나요?\n무슨 이야기든 편하게 해요.',
    sub_night: '밤에는 더 솔직해지는 것 같아요.\n오늘 마음은 어때요?',
    memHint_day:   '지난번 가게 이야기가 생각나요 — 요즘 어때요?',
    memHint_night: '오늘 하루 잘 마무리 되길 바랐어요.',
    section_day:   '오늘 이야기해볼까요',
    section_night: '지금 마음이 어때요',
    cta: 'Emma와 대화하기',
    home: '🏠 홈 화면 추가',
    notif: '🔔 알림 설정',
    back: '← 홈',
  },
  ES: {
    day:       (n) => `¡Hola, ${n}! 😊`,
    night:     (n) => `¿Aún despierto, ${n}? 🌙`,
    sub_day:   '¿Cómo fue tu día?\nPuedes contarme cualquier cosa.',
    sub_night: 'Las noches nos hacen más honestos.\n¿Cómo te sientes?',
    memHint_day:   'Recuerdo lo que me contaste — ¿cómo van las cosas?',
    memHint_night: 'Espero que el día haya terminado bien.',
    section_day:   'De qué hablamos hoy',
    section_night: 'Cómo está tu corazón',
    cta: 'Hablar con Emma',
    home: '🏠 Añadir al inicio',
    notif: '🔔 Notificaciones',
    back: '← Inicio',
  },
};

// ── detect day / night from system clock ─────────────────────────────────────
function getTimeMode() {
  const h = new Date().getHours();
  return h >= 6 && h < 21 ? 'day' : 'night';
}

// ── persist lang to localStorage + user object + server ──────────────────────
function saveLang(lang) {
  localStorage.setItem('lang', lang);
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    u.lang = lang;
    localStorage.setItem('user', JSON.stringify(u));
  } catch {}
  const t = localStorage.getItem('token');
  if (t) {
    fetch('/api/user/lang', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ lang }),
    }).catch(() => {});
  }
}

export default function EmmaHome({ userName = '' }) {
  const router  = useRouter();
  const [mode, setMode]   = useState('day');
  const [lang, setLang]   = useState('KO');
  const [displayName, setDisplayName] = useState(userName);

  // auto-detect time mode + read userName + lang from localStorage on mount
  useEffect(() => {
    setMode(getTimeMode());

    // lang from localStorage (stored as lowercase 'en'/'ko'/'es' by old page)
    const storedLang = localStorage.getItem('lang');
    if (storedLang) setLang(storedLang.toUpperCase());

    if (!displayName) {
      try {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        if (u) {
          setDisplayName(u.name || u.email?.split('@')[0] || '');
          // also read lang from user object if available
          if (u.lang) setLang(u.lang.toUpperCase());
        }
      } catch {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function cycleLang() {
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    setLang(next);
    saveLang(next.toLowerCase());
  }

  const isDay = mode === 'day';
  const chips = isDay ? DAY_CHIPS : NIGHT_CHIPS;
  const name  = displayName || '친구';
  const t     = GREETINGS[lang] || GREETINGS.KO;

  function handleChip(chip) {
    router.push(`/chat?topic=${encodeURIComponent(chip.label)}`);
  }

  return (
    <div className={`${styles.screen} ${isDay ? styles.day : styles.night}`}>

      {/* ── top bar ── */}
      <header className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push('/')}>{t.back}</button>
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
          {/* language cycle button */}
          <button
            className={styles.langPill}
            onClick={cycleLang}
            aria-label="언어 변경"
            title="EN → KO → ES"
          >
            {lang}
          </button>
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
          <p className={styles.greeting}>{isDay ? t.day(name) : t.night(name)}</p>
          <p className={styles.greetingSub}>{isDay ? t.sub_day : t.sub_night}</p>
        </div>

        {/* memory hint */}
        <div className={styles.memBar}>
          <span className={styles.memDot} />
          <span className={styles.memText}>{isDay ? t.memHint_day : t.memHint_night}</span>
        </div>

        {/* topic chips */}
        <div>
          <p className={styles.sectionLabel}>{isDay ? t.section_day : t.section_night}</p>
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
          {t.cta}
        </button>

        {/* bottom links */}
        <div className={styles.bottomLinks}>
          <button className={styles.bottomLink}>{t.home}</button>
          <button className={styles.bottomLink}>{t.notif}</button>
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
