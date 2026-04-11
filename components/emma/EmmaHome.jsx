'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import EmmaAvatar from './EmmaAvatar';
import styles from './EmmaHome.module.css';

// ── language cycle ─────────────────────────────────────────────────────────────
const LANGS = ['EN', 'KO', 'ES'];

const T = {
  EN: {
    day:        (n) => `Hello, ${n}! 😊`,
    night:      (n) => `Still up, ${n}? 🌙`,
    memHint_day:   'I remember our shop talk — how are things lately?',
    memHint_night: 'I hope today ended on a good note.',
    yourFriend: 'your friend',
    cta:     'Talk with Emma',
    addHome: 'Add to Home',
    notif:   'Reminders',
    info:    'About',
    logout:  'Log out',
    infoMsg: 'Emma is a warm AI friend who remembers everything you share ❤️',
    topics: [
      { label: "Today's\nstory",  color: 'orange', action: 'chat' },
      { label: 'Grateful\nthings', color: 'green',  action: 'chat' },
      { label: "Today's\ntasks",  color: 'purple', action: 'chat' },
      { label: 'Reminder\nsettings', color: 'yellow', action: 'notif' },
      { label: 'News &\ntrends',  color: 'blue',   action: 'chat' },
    ],
  },
  KO: {
    day:        (n) => `안녕하세요, ${n}! 😊`,
    night:      (n) => `잘 자고 있었나요, ${n}? 🌙`,
    memHint_day:   '지난번 가게 이야기가 생각나요 — 요즘 어때요?',
    memHint_night: '오늘 하루 잘 마무리 되길 바랐어요.',
    yourFriend: '당신의 친구',
    cta:     'Emma와 대화하기',
    addHome: '홈 추가',
    notif:   '알림',
    info:    '정보',
    logout:  '로그아웃',
    infoMsg: 'Emma는 당신이 나누는 모든 이야기를 기억하는 따뜻한 AI 친구예요 ❤️',
    topics: [
      { label: '오늘\n이야기',  color: 'orange', action: 'chat' },
      { label: '감사한\n것들',  color: 'green',  action: 'chat' },
      { label: '오늘\n할 일',   color: 'purple', action: 'chat' },
      { label: '알림\n설정',    color: 'yellow', action: 'notif' },
      { label: '뉴스\n트렌드',  color: 'blue',   action: 'chat' },
    ],
  },
  ES: {
    day:        (n) => `¡Hola, ${n}! 😊`,
    night:      (n) => `¿Aún despierto, ${n}? 🌙`,
    memHint_day:   'Recuerdo lo que me contaste — ¿cómo van las cosas?',
    memHint_night: 'Espero que el día haya terminado bien.',
    yourFriend: 'tu amiga',
    cta:     'Hablar con Emma',
    addHome: 'Inicio',
    notif:   'Avisos',
    info:    'Info',
    logout:  'Salir',
    infoMsg: 'Emma es tu amiga IA que recuerda todo lo que compartes ❤️',
    topics: [
      { label: 'Hoy',       color: 'orange', action: 'chat' },
      { label: 'Gratitud',  color: 'green',  action: 'chat' },
      { label: 'Tareas',    color: 'purple', action: 'chat' },
      { label: 'Avisos',    color: 'yellow', action: 'notif' },
      { label: 'Noticias',  color: 'blue',   action: 'chat' },
    ],
  },
};

// ── topic pill icons ───────────────────────────────────────────────────────────
function IconToday() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 3C7.13 3 4 6.13 4 10c0 2.5 1.24 4.71 3.14 6.05L7 19h8l-.14-2.95A7 7 0 0018 10c0-3.87-3.13-7-7-7z" fill="#ea580c" opacity="0.85"/>
      <rect x="8" y="19" width="6" height="1.5" rx="0.75" fill="#ea580c" opacity="0.5"/>
    </svg>
  );
}
function IconGrateful() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 4C7.13 4 4 7.13 4 11s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7z" fill="rgba(52,199,89,0.2)"/>
      <path d="M8 11.5l2 2 4-4" stroke="#34c759" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconTasks() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M4 6h14M4 10h10M4 14h12" stroke="#5856d6" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconReminder() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="7" stroke="#ff9f0a" strokeWidth="1.4" fill="none"/>
      <path d="M11 7v4l2.5 2.5" stroke="#ff9f0a" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function IconNews() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M4 8h14l-1.5 8H5.5L4 8z" fill="rgba(90,200,250,0.2)" stroke="#5ac8fa" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M8 8V6a3 3 0 016 0v2" stroke="#5ac8fa" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

const TOPIC_ICONS  = [IconToday, IconGrateful, IconTasks, IconReminder, IconNews];
const PILL_BG = {
  orange: 'rgba(234,88,12,0.1)',
  green:  'rgba(52,199,89,0.1)',
  purple: 'rgba(88,86,214,0.1)',
  yellow: 'rgba(255,159,10,0.1)',
  blue:   'rgba(90,200,250,0.1)',
};

// ── util icon SVGs ─────────────────────────────────────────────────────────────
function IconHome() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="1.5" fill="rgba(0,0,0,0.25)"/>
      <rect x="8" y="1" width="5" height="5" rx="1.5" fill="rgba(0,0,0,0.25)"/>
      <rect x="1" y="8" width="5" height="5" rx="1.5" fill="rgba(0,0,0,0.25)"/>
      <rect x="8" y="8" width="5" height="5" rx="1.5" fill="rgba(0,0,0,0.25)"/>
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5a4.5 4.5 0 014.5 4.5c0 2-1.5 3.5-1.5 3.5H4S2.5 8 2.5 6A4.5 4.5 0 017 1.5z" stroke="rgba(0,0,0,0.3)" strokeWidth="1" fill="none"/>
      <path d="M5.5 9.5S5.5 12 7 12s1.5-2.5 1.5-2.5" stroke="rgba(0,0,0,0.3)" strokeWidth="1" fill="none" strokeLinecap="round"/>
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="rgba(0,0,0,0.3)" strokeWidth="1" fill="none"/>
      <circle cx="7" cy="5" r="1" fill="rgba(0,0,0,0.3)"/>
      <path d="M7 7.5v3" stroke="rgba(0,0,0,0.3)" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────
function getTimeMode() {
  const h = new Date().getHours();
  return h >= 6 && h < 21 ? 'day' : 'night';
}

function saveLang(lang) {
  localStorage.setItem('lang', lang);
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    u.lang = lang;
    localStorage.setItem('user', JSON.stringify(u));
  } catch {}
  const tk = localStorage.getItem('token');
  if (tk) {
    fetch('/api/user/lang', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
      body: JSON.stringify({ lang }),
    }).catch(() => {});
  }
}

const IOS_TIP = {
  EN: "Tap the Share button in Safari, then 'Add to Home Screen'",
  KO: "Safari 하단 공유 버튼 → '홈 화면에 추가' 를 눌러주세요",
  ES: "Toca Compartir en Safari y luego 'Añadir a inicio'",
};
const NOTIF_MSG = {
  granted: { EN: 'Notifications are enabled ✓', KO: '알림이 허용되어 있어요 ✓', ES: 'Notificaciones habilitadas ✓' },
  denied:  { EN: 'Notifications blocked — please allow in browser settings', KO: '알림이 차단되어 있어요 — 브라우저 설정에서 허용해 주세요', ES: 'Notificaciones bloqueadas — permite en ajustes del navegador' },
  noapi:   { EN: 'Notifications not supported in this browser', KO: '이 브라우저는 알림을 지원하지 않아요', ES: 'Este navegador no admite notificaciones' },
};

// ── component ──────────────────────────────────────────────────────────────────
export default function EmmaHome({ userName = '' }) {
  const router = useRouter();
  const [mode, setMode]           = useState('day');
  const [lang, setLang]           = useState('KO');
  const [displayName, setDisplay] = useState(userName);
  const [toast, setToast]         = useState('');
  const deferredPromptRef         = useRef(null);

  function showToast(msg, ms = 3500) {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  }

  useEffect(() => {
    setMode(getTimeMode());
    const storedLang = localStorage.getItem('lang');
    if (storedLang) setLang(storedLang.toUpperCase());
    if (!displayName) {
      try {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        if (u) {
          setDisplay(u.name || u.email?.split('@')[0] || '');
          if (u.lang) setLang(u.lang.toUpperCase());
        }
      } catch {}
    }
    const handler = (e) => { e.preventDefault(); deferredPromptRef.current = e; };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function cycleLang() {
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    setLang(next);
    saveLang(next.toLowerCase());
  }

  async function handleAddToHome() {
    if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
      showToast(lang === 'KO' ? '이미 홈 화면에 추가되어 있어요 ✓' : lang === 'ES' ? 'Ya está en la pantalla de inicio ✓' : 'Already added to home screen ✓');
      return;
    }
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;
      deferredPromptRef.current = null;
      if (outcome === 'accepted') showToast(lang === 'KO' ? '홈 화면에 추가했어요! 🎉' : lang === 'ES' ? '¡Añadido al inicio! 🎉' : 'Added to home screen! 🎉');
      return;
    }
    showToast(IOS_TIP[lang] || IOS_TIP.EN, 5000);
  }

  async function handleNotif() {
    if (!('Notification' in window)) { showToast((NOTIF_MSG.noapi[lang] || NOTIF_MSG.noapi.EN)); return; }
    if (Notification.permission === 'granted') { showToast(NOTIF_MSG.granted[lang] || NOTIF_MSG.granted.EN); return; }
    if (Notification.permission === 'denied')  { showToast(NOTIF_MSG.denied[lang]  || NOTIF_MSG.denied.EN, 5000); return; }
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      showToast(NOTIF_MSG.granted[lang] || NOTIF_MSG.granted.EN);
      new Notification('Emma', { body: lang === 'KO' ? '안녕하세요! 알림이 설정됐어요 😊' : lang === 'ES' ? '¡Hola! Las notificaciones están activadas 😊' : 'Hi! Notifications are set up 😊', icon: '/icons/icon-192.png' });
    } else {
      showToast(NOTIF_MSG.denied[lang] || NOTIF_MSG.denied.EN, 5000);
    }
  }

  function handleTopicClick(topic) {
    if (topic.action === 'notif') { handleNotif(); return; }
    router.push('/chat');
  }

  const isDay = mode === 'day';
  const name  = displayName || (lang === 'KO' ? '친구' : lang === 'ES' ? 'amigo' : 'friend');
  const t     = T[lang] || T.KO;

  return (
    <div className={`${styles.screen} ${isDay ? styles.day : styles.night}`}>

      {/* toast */}
      {toast && (
        <div className={`${styles.toast} ${isDay ? styles.toastDay : styles.toastNight}`}>
          {toast}
        </div>
      )}

      {/* ── top bar ── */}
      <header className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.push('/login');
        }}>{t.logout}</button>

        <div className={styles.topCenter}>
          <span className={styles.statusDot} />
          <span className={styles.topName}>Emma</span>
        </div>

        <div className={styles.topRight}>
          <button className={styles.modeToggle} onClick={() => setMode(m => m === 'day' ? 'night' : 'day')} aria-label="낮/밤 전환">
            {isDay ? '🌙' : '☀️'}
          </button>
          <button className={styles.langPill} onClick={cycleLang} aria-label="언어 변경">
            {lang}
          </button>
        </div>
      </header>

      {/* ── avatar zone ── */}
      <div className={styles.avatarArea}>
        <p className={styles.yourFriend}>{t.yourFriend}</p>
        <EmmaAvatar size="lg" mode={mode} className={styles.avatar} />
        <div className={isDay ? styles.warmGlow : styles.nightGlow} />
      </div>

      {/* ── body ── */}
      <main className={styles.body}>

        {/* greeting */}
        <div className={styles.greetingBlock}>
          <p className={styles.greeting}>{isDay ? t.day(name) : t.night(name)}</p>
          <div className={styles.memRow}>
            <span className={styles.memDot} />
            <span className={styles.memText}>{isDay ? t.memHint_day : t.memHint_night}</span>
          </div>
        </div>

        {/* topic pills */}
        <div className={styles.topics}>
          {t.topics.map((topic, i) => {
            const Icon = TOPIC_ICONS[i];
            return (
              <button
                key={i}
                className={styles.topicPill}
                onClick={() => handleTopicClick(topic)}
                aria-label={topic.label}
              >
                <div className={styles.tpIcon} style={{ background: PILL_BG[topic.color] }}>
                  <Icon />
                </div>
                <span className={styles.tpLabel}>{topic.label}</span>
              </button>
            );
          })}
        </div>

        {/* CTA */}
        <div className={styles.ctaZone}>
          <button className={styles.ctaBtn} onClick={() => router.push('/chat')}>
            <MicIcon />
            {t.cta}
          </button>
        </div>

        {/* utility row */}
        <div className={styles.utilRow}>
          <button className={styles.utilBtn} onClick={handleAddToHome}>
            <div className={styles.utilIcon}><IconHome /></div>
            <span className={styles.utilLabel}>{t.addHome}</span>
          </button>
          <button className={styles.utilBtn} onClick={handleNotif}>
            <div className={styles.utilIcon}><IconBell /></div>
            <span className={styles.utilLabel}>{t.notif}</span>
          </button>
          <button className={styles.utilBtn} onClick={() => showToast(t.infoMsg, 4000)}>
            <div className={styles.utilIcon}><IconInfo /></div>
            <span className={styles.utilLabel}>{t.info}</span>
          </button>
        </div>

      </main>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" fill="none" aria-hidden="true">
      <rect x="5" y="0" width="6" height="10" rx="3" fill="white"/>
      <path d="M2 9c0 3.31 2.69 6 6 6s6-2.69 6-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <line x1="8" y1="15" x2="8" y2="18" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
