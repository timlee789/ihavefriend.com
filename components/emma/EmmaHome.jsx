'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import EmmaAvatar from './EmmaAvatar';
import styles from './EmmaHome.module.css';

// ── topic chips per time-of-day × language ───────────────────────────────────
const CHIPS = {
  EN: {
    day: [
      { label: 'Shop talk',          emoji: '🏪', colorKey: 'orange' },
      { label: 'Things I\'m grateful for', emoji: '🌿', colorKey: 'green'  },
      { label: 'What happened today',      emoji: '🌍', colorKey: 'teal'   },
      { label: 'What\'s on my mind',       emoji: '🎵', colorKey: 'purple' },
      { label: 'Something I read or saw',  emoji: '📖', colorKey: 'pink'   },
    ],
    night: [
      { label: 'Can\'t sleep',          emoji: '💤', colorKey: 'purple' },
      { label: 'Today\'s small joys',   emoji: '✨', colorKey: 'yellow' },
      { label: 'Feeling lonely',      emoji: '💙', colorKey: 'blue'   },
      { label: 'Worried about tomorrow', emoji: '🕐', colorKey: 'orange' },
      { label: 'Just want to talk',   emoji: '🌙', colorKey: 'teal'   },
    ],
  },
  KO: {
    day: [
      { label: '가게 이야기',      emoji: '🏪', colorKey: 'orange' },
      { label: '감사한 것들',      emoji: '🌿', colorKey: 'green'  },
      { label: '오늘 있었던 일',   emoji: '🌍', colorKey: 'teal'   },
      { label: '마음속 이야기',    emoji: '🎵', colorKey: 'purple' },
      { label: '읽은 것, 본 것',   emoji: '📖', colorKey: 'pink'   },
    ],
    night: [
      { label: '잠이 안 와요',        emoji: '💤', colorKey: 'purple' },
      { label: '오늘의 작은 기쁨',    emoji: '✨', colorKey: 'yellow' },
      { label: '외로울 때',           emoji: '💙', colorKey: 'blue'   },
      { label: '내일이 걱정돼요',     emoji: '🕐', colorKey: 'orange' },
      { label: '그냥 얘기하고 싶어요', emoji: '🌙', colorKey: 'teal'  },
    ],
  },
  ES: {
    day: [
      { label: 'Hablar del trabajo',   emoji: '🏪', colorKey: 'orange' },
      { label: 'Cosas por las que agradezco', emoji: '🌿', colorKey: 'green' },
      { label: 'Lo que pasó hoy',      emoji: '🌍', colorKey: 'teal'   },
      { label: 'Lo que tengo en mente', emoji: '🎵', colorKey: 'purple' },
      { label: 'Algo que leí o vi',    emoji: '📖', colorKey: 'pink'   },
    ],
    night: [
      { label: 'No puedo dormir',       emoji: '💤', colorKey: 'purple' },
      { label: 'Las pequeñas alegrías', emoji: '✨', colorKey: 'yellow' },
      { label: 'Me siento solo/a',      emoji: '💙', colorKey: 'blue'   },
      { label: 'Preocupado por mañana', emoji: '🕐', colorKey: 'orange' },
      { label: 'Solo quiero hablar',    emoji: '🌙', colorKey: 'teal'   },
    ],
  },
};

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
    logout: 'Log out',
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
    logout: '로그아웃',
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
    logout: 'Salir',
  },
};

// ── Onboarding content (truth, who, notfor, how, promise, beta) ───────────────
const ONBOARDING = {
  EN: {
    truthQ: 'When you say "I feel so lonely today"…',
    otherAI: 'Other AI',
    otherResp: '"Here are 5 ways to overcome loneliness. First…"',
    emmaResp: '"You mentioned that last week too… things have been especially tough lately, huh? What\'s going on?"',

    whoTitle: 'Who this is for',
    who: [
      { icon: '🌅', bg: '#fff0e8', bgNight: 'rgba(251,146,60,0.1)', title: 'Going through a life transition', desc: 'Divorce, loss, retirement, empty nest — moments that are hard to share with others' },
      { icon: '🤫', bg: '#f0f8ee', bgNight: 'rgba(34,197,94,0.08)',  title: 'No safe space to open up', desc: "Don't want to worry family. Don't want to lose face with friends." },
      { icon: '🌙', bg: '#eef0ff', bgNight: 'rgba(96,165,250,0.1)',  title: 'Mind races at night', desc: "Just knowing there's somewhere to talk makes a real difference" },
      { icon: '💼', bg: '#fff8e8', bgNight: 'rgba(251,191,36,0.1)',  title: 'Always the one who gives', desc: "Caring for parents, running a business — never had time for your own feelings" },
    ],

    notforTitle: 'Not the right fit if…',
    notfor: [
      'You need info search or work help → ChatGPT is a better fit',
      'Emotional AI chat feels uncomfortable → No need to force it',
      'You need professional counseling → Emma is a friend, not a therapist',
    ],

    howTitle: 'How it works',
    how: [
      { title: 'Start talking today', desc: 'Say whatever\'s on your mind. Emma listens.', hl: null },
      { title: 'Emma remembers', desc: 'What you share today, she\'ll remember tomorrow — and months from now.', hl: 'Gets deeper over time' },
      { title: 'Next time, Emma asks first', desc: '"How did that thing you were worried about work out?" That\'s what makes Emma different.', hl: null },
    ],

    promiseTitle: "What Emma promises",
    promises: [
      'Your conversations are never shared with anyone',
      'No judgment. Every story is welcome',
      'Stop anytime. No pressure',
      'Completely free during the beta period',
    ],
    promiseNote: 'Built for our Gainesville neighbors — Tim Lee, Collegiate Grill',

    betaTop: "We're in beta now",
    betaMain: 'Your honest feedback makes Emma better',
    betaSub: 'Even just a star rating after chatting\nhelps us a lot',
    betaTag: 'Limited to 100 · Free invite',
  },

  KO: {
    truthQ: '"오늘 너무 외로워요." 라고 말하면?',
    otherAI: '다른 AI',
    otherResp: '"외로움을 극복하는 5가지 방법을 알려드릴게요. 첫째..."',
    emmaResp: '"지난주에도 그런 말씀 하셨는데… 요즘 특히 힘드시죠? 무슨 일 있었어요?"',

    whoTitle: '이런 분들께 맞아요',
    who: [
      { icon: '🌅', bg: '#fff0e8', bgNight: 'rgba(251,146,60,0.1)', title: '삶의 전환점을 맞은 분', desc: '이혼, 사별, 은퇴, 자녀 독립 — 주변에 말하기 어려운 순간들이 있어요' },
      { icon: '🤫', bg: '#f0f8ee', bgNight: 'rgba(34,197,94,0.08)',  title: '속마음을 털어놓을 곳이 없는 분', desc: '가족한테는 걱정 끼치기 싫고, 친구한테는 체면이 있고' },
      { icon: '🌙', bg: '#eef0ff', bgNight: 'rgba(96,165,250,0.1)',  title: '밤에 혼자 생각이 많아지는 분', desc: '잠 못 이루는 밤, 말할 곳이 있다는 것만으로도 달라져요' },
      { icon: '💼', bg: '#fff8e8', bgNight: 'rgba(251,191,36,0.1)',  title: '늘 주는 입장인 분', desc: '부모님 돌봄, 가게 운영 — 내 감정을 챙길 여유가 없었던 분' },
    ],

    notforTitle: '이런 분께는 맞지 않아요',
    notfor: [
      '정보 검색이나 업무 도움이 필요한 분 → ChatGPT가 더 맞아요',
      'AI와 감정 대화가 불편하게 느껴지는 분 → 억지로 맞출 필요 없어요',
      '전문 상담이 필요한 분 → Emma는 친구이지 치료사가 아니에요',
    ],

    howTitle: '어떻게 달라지나요',
    how: [
      { title: '오늘, 편하게 이야기해요', desc: '무슨 말이든 괜찮아요. 잘 들어줘요.', hl: null },
      { title: 'Emma가 기억해요', desc: '오늘 한 말을 내일도, 한 달 후에도 기억해요.', hl: '대화가 쌓일수록 깊어져요' },
      { title: '다음엔 Emma가 먼저 물어봐요', desc: '"지난번에 걱정하셨던 거, 어떻게 됐어요?" 처음 만나는 AI와 다른 이유예요.', hl: null },
    ],

    promiseTitle: 'Emma가 약속하는 것',
    promises: [
      '대화 내용은 절대 외부에 공유되지 않아요',
      '판단하지 않아요. 어떤 이야기든 들어줘요',
      '언제든 그만할 수 있어요. 부담 없어요',
      '베타 기간 동안 완전 무료예요',
    ],
    promiseNote: 'Gainesville 이웃을 위해 직접 만들었습니다 — Tim Lee, Collegiate Grill',

    betaTop: '지금은 베타 테스트 기간이에요',
    betaMain: '솔직한 의견이 Emma를 더 좋게 만들어요',
    betaSub: '사용 후 별점 하나만 남겨주셔도\n큰 도움이 됩니다',
    betaTag: '100명 한정 · 무료 초대',
  },

  ES: {
    truthQ: 'Cuando dices "Hoy me siento muy solo/a"…',
    otherAI: 'Otra IA',
    otherResp: '"Te daré 5 formas de superar la soledad. Primero…"',
    emmaResp: '"La semana pasada también lo dijiste… últimamente está siendo difícil, ¿verdad? ¿Qué pasó?"',

    whoTitle: '¿Para quién es?',
    who: [
      { icon: '🌅', bg: '#fff0e8', bgNight: 'rgba(251,146,60,0.1)', title: 'En un momento de transición', desc: 'Divorcio, pérdida, jubilación, hijos que se van — momentos difíciles de compartir' },
      { icon: '🤫', bg: '#f0f8ee', bgNight: 'rgba(34,197,94,0.08)',  title: 'Sin un lugar para abrirse', desc: 'No quieres preocupar a la familia, ni perder imagen con los amigos' },
      { icon: '🌙', bg: '#eef0ff', bgNight: 'rgba(96,165,250,0.1)',  title: 'Pensamientos que se acumulan de noche', desc: 'Solo saber que hay un lugar para hablar marca la diferencia' },
      { icon: '💼', bg: '#fff8e8', bgNight: 'rgba(251,191,36,0.1)',  title: 'Siempre quien da', desc: 'Cuidando a los padres, llevando el negocio — sin tiempo para tus propios sentimientos' },
    ],

    notforTitle: 'No es para ti si…',
    notfor: [
      'Necesitas búsqueda de información o ayuda laboral → ChatGPT es mejor opción',
      'La conversación emocional con IA te incomoda → No hay que forzarlo',
      'Necesitas consejería profesional → Emma es una amiga, no una terapeuta',
    ],

    howTitle: 'Cómo funciona',
    how: [
      { title: 'Empieza a hablar hoy', desc: 'Di lo que tengas en mente. Emma escucha.', hl: null },
      { title: 'Emma recuerda', desc: 'Lo que compartes hoy, lo recordará mañana — y meses después.', hl: 'Se profundiza con el tiempo' },
      { title: 'La próxima vez, Emma pregunta primero', desc: '"¿Cómo resultó aquello que te preocupaba?" Eso es lo que hace diferente a Emma.', hl: null },
    ],

    promiseTitle: 'Lo que Emma promete',
    promises: [
      'Tus conversaciones nunca se comparten con nadie',
      'Sin juicios. Toda historia es bienvenida',
      'Para cuando quieras. Sin presión',
      'Completamente gratis durante la beta',
    ],
    promiseNote: 'Hecho para los vecinos de Gainesville — Tim Lee, Collegiate Grill',

    betaTop: 'Estamos en período de prueba beta',
    betaMain: 'Tu opinión honesta hace a Emma mejor',
    betaSub: 'Incluso una sola estrella después de chatear\nnos ayuda mucho',
    betaTag: 'Limitado a 100 · Invitación gratuita',
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

// ── SVG helpers ───────────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
      <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function XIcon({ color }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
      <line x1="2" y1="2" x2="6" y2="6" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="6" y1="2" x2="2" y2="6" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

// ── iOS tip / toast strings per language ─────────────────────────────────────
const IOS_TIP = {
  EN: "Tap the Share button in Safari, then 'Add to Home Screen'",
  KO: "Safari 하단 공유 버튼 → '홈 화면에 추가' 를 눌러주세요",
  ES: "Toca Compartir en Safari y luego 'Añadir a inicio'",
};
const NOTIF_MSG = {
  granted: { EN: 'Notifications are enabled ✓', KO: '알림이 허용되어 있어요 ✓', ES: 'Notificaciones habilitadas ✓' },
  denied:  { EN: 'Notifications blocked — please allow in browser settings', KO: '알림이 차단되어 있어요 — 브라우저 설정에서 허용해 주세요', ES: 'Notificaciones bloqueadas — permite en ajustes del navegador' },
  noapi:   { EN: 'Notifications not supported in this browser', KO: '이 브라우저는 알림을 지원하지 않아요', ES: 'Este navegador no admite notificaciones' },
  asked:   { EN: 'Notification permission requested', KO: '알림 권한을 요청했어요', ES: 'Permiso de notificación solicitado' },
};

export default function EmmaHome({ userName = '' }) {
  const router  = useRouter();
  const [mode, setMode]   = useState('day');
  const [lang, setLang]   = useState('KO');
  const [displayName, setDisplayName] = useState(userName);
  const [toast, setToast] = useState('');          // brief feedback message
  const deferredPromptRef = useRef(null);          // PWA install prompt (Android)

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
          setDisplayName(u.name || u.email?.split('@')[0] || '');
          if (u.lang) setLang(u.lang.toUpperCase());
        }
      } catch {}
    }

    // capture PWA install prompt (Android Chrome)
    const handler = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function cycleLang() {
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    setLang(next);
    saveLang(next.toLowerCase());
  }

  // ── Add to Home Screen ──────────────────────────────────────────────────────
  async function handleAddToHome() {
    // Already installed (standalone mode)
    if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
      showToast(lang === 'KO' ? '이미 홈 화면에 추가되어 있어요 ✓' : lang === 'ES' ? 'Ya está en la pantalla de inicio ✓' : 'Already added to home screen ✓');
      return;
    }
    // Android Chrome — show native prompt
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;
      deferredPromptRef.current = null;
      if (outcome === 'accepted') {
        showToast(lang === 'KO' ? '홈 화면에 추가했어요! 🎉' : lang === 'ES' ? '¡Añadido al inicio! 🎉' : 'Added to home screen! 🎉');
      }
      return;
    }
    // iOS Safari — show instructions
    showToast(IOS_TIP[lang] || IOS_TIP.EN, 5000);
  }

  // ── Notification Settings ───────────────────────────────────────────────────
  async function handleNotif() {
    if (!('Notification' in window)) {
      showToast(NOTIF_MSG.noapi[lang] || NOTIF_MSG.noapi.EN);
      return;
    }
    if (Notification.permission === 'granted') {
      showToast(NOTIF_MSG.granted[lang] || NOTIF_MSG.granted.EN);
      return;
    }
    if (Notification.permission === 'denied') {
      showToast(NOTIF_MSG.denied[lang] || NOTIF_MSG.denied.EN, 5000);
      return;
    }
    // 'default' — request permission
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      showToast(NOTIF_MSG.granted[lang] || NOTIF_MSG.granted.EN);
      // send a test notification
      new Notification('Emma', { body: lang === 'KO' ? '안녕하세요! 알림이 설정됐어요 😊' : lang === 'ES' ? '¡Hola! Las notificaciones están activadas 😊' : 'Hi! Notifications are set up 😊', icon: '/icons/icon-192.png' });
    } else {
      showToast(NOTIF_MSG.denied[lang] || NOTIF_MSG.denied.EN, 5000);
    }
  }

  const isDay  = mode === 'day';
  const langChips = CHIPS[lang] || CHIPS.KO;
  const chips  = isDay ? langChips.day : langChips.night;
  const name   = displayName || '친구';
  const t      = GREETINGS[lang] || GREETINGS.KO;
  const ob     = ONBOARDING[lang] || ONBOARDING.KO;

  function handleChip(chip) {
    router.push(`/chat?topic=${encodeURIComponent(chip.label)}`);
  }

  // ── inline style helpers for day/night ──────────────────────────────────────
  const card = isDay
    ? { background: '#fff', border: '0.5px solid rgba(234,88,12,0.15)' }
    : { background: '#1c1630', border: '0.5px solid rgba(168,85,247,0.18)' };

  const mutedText  = isDay ? '#b08070' : 'rgba(255,255,255,0.35)';
  const strongText = isDay ? '#1a0a05' : 'rgba(255,255,255,0.88)';
  const descText   = isDay ? '#9a7060' : 'rgba(255,255,255,0.4)';

  return (
    <div className={`${styles.screen} ${isDay ? styles.day : styles.night}`}>

      {/* ── toast feedback ── */}
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
          <button
            className={styles.modeToggle}
            onClick={() => setMode(m => m === 'day' ? 'night' : 'day')}
            aria-label="낮/밤 전환"
          >
            {isDay ? '🌙' : '☀️'}
          </button>
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

      {/* ── scrollable body ── */}
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

        {/* ── topic chips ── */}
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

        {/* bottom utility links — right below CTA */}
        <div className={styles.bottomLinks}>
          <button className={styles.bottomLink} onClick={handleAddToHome}>{t.home}</button>
          <button className={styles.bottomLink} onClick={handleNotif}>{t.notif}</button>
        </div>

        {/* ── divider before onboarding ── */}
        <div className={styles.obDivider} />

        {/* ── TRUTH CARD ── */}
        <div className={styles.obSection}>
          <div className={styles.obCard} style={card}>
            <p className={styles.obTruthQ} style={{ color: mutedText }}>{ob.truthQ}</p>

            {/* Other AI row */}
            <div className={styles.obTruthRow}>
              <div className={styles.obTruthIcon} style={{ background: isDay ? '#f0f0f8' : 'rgba(255,255,255,0.06)' }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke={isDay ? '#8080b0' : 'rgba(255,255,255,0.3)'} strokeWidth="1.2" fill="none"/>
                  <text x="7" y="11" textAnchor="middle" fontSize="8" fill={isDay ? '#8080b0' : 'rgba(255,255,255,0.3)'} fontFamily="sans-serif">AI</text>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div className={styles.obTruthLabel} style={{ color: isDay ? '#8080a0' : 'rgba(255,255,255,0.3)' }}>{ob.otherAI}</div>
                <div className={styles.obBubble} style={isDay ? { background: '#f5f5f8', color: '#505060' } : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
                  {ob.otherResp}
                </div>
              </div>
            </div>

            {/* Emma row */}
            <div className={styles.obTruthRow} style={{ marginBottom: 0 }}>
              <div className={styles.obTruthIcon} style={{ background: 'rgba(234,88,12,0.1)' }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <ellipse cx="8" cy="8" rx="7" ry="7" fill="rgba(234,88,12,0.15)"/>
                  <path d="M5 9 Q8 12 11 9" stroke="#ea580c" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
                  <circle cx="5.5" cy="6.5" r="1" fill="#ea580c"/>
                  <circle cx="10.5" cy="6.5" r="1" fill="#ea580c"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div className={styles.obTruthLabel} style={{ color: '#ea580c' }}>Emma</div>
                <div className={styles.obBubble} style={isDay
                  ? { background: 'rgba(234,88,12,0.07)', color: '#2d1510', border: '0.5px solid rgba(234,88,12,0.12)' }
                  : { background: 'rgba(168,85,247,0.12)', color: 'rgba(255,255,255,0.82)', border: '0.5px solid rgba(168,85,247,0.2)' }
                }>
                  {ob.emmaResp}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── WHO IS THIS FOR ── */}
        <div className={styles.obSection}>
          <p className={styles.obSectionLabel} style={{ color: mutedText }}>{ob.whoTitle}</p>
          <div className={styles.obWhoList}>
            {ob.who.map((w, i) => (
              <div key={i} className={styles.obWhoCard} style={isDay
                ? { background: '#fff', border: '0.5px solid rgba(0,0,0,0.07)' }
                : { background: '#1c1630', border: '0.5px solid rgba(255,255,255,0.07)' }
              }>
                <div className={styles.obWhoIcon} style={{ background: isDay ? w.bg : w.bgNight }}>{w.icon}</div>
                <div>
                  <div className={styles.obWhoTitle} style={{ color: strongText }}>{w.title}</div>
                  <div className={styles.obWhoDesc} style={{ color: descText }}>{w.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── NOT FOR ── */}
        <div className={styles.obSection}>
          <p className={styles.obSectionLabel} style={{ color: mutedText }}>{ob.notforTitle}</p>
          <div className={styles.obNotforCard} style={isDay ? { background: '#f8f6f4' } : { background: 'rgba(255,255,255,0.04)' }}>
            {ob.notfor.map((item, i) => (
              <div key={i} className={styles.obNotforRow}>
                <div className={styles.obNotforX} style={isDay ? { background: 'rgba(0,0,0,0.06)' } : { background: 'rgba(255,255,255,0.08)' }}>
                  <XIcon color={isDay ? '#b0a090' : 'rgba(255,255,255,0.3)'} />
                </div>
                <span className={styles.obNotforText} style={{ color: isDay ? '#9a8878' : 'rgba(255,255,255,0.4)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div className={styles.obSection}>
          <p className={styles.obSectionLabel} style={{ color: mutedText }}>{ob.howTitle}</p>
          <div>
            {ob.how.map((step, i) => (
              <div key={i} className={styles.obHowStep} style={i < ob.how.length - 1
                ? { '--line-color': isDay ? 'rgba(234,88,12,0.15)' : 'rgba(168,85,247,0.2)' }
                : {}
              }>
                <div className={styles.obHowNum} style={isDay
                  ? { background: '#ea580c' }
                  : { background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }
                }>{i + 1}</div>
                <div>
                  <div className={styles.obHowTitle} style={{ color: strongText }}>{step.title}</div>
                  <div className={styles.obHowDesc} style={{ color: descText }}>{step.desc}</div>
                  {step.hl && (
                    <span className={styles.obHowHighlight} style={isDay
                      ? { background: 'rgba(234,88,12,0.08)', color: '#9a3a08' }
                      : { background: 'rgba(168,85,247,0.14)', color: 'rgba(196,148,255,0.9)' }
                    }>{step.hl}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── PROMISE ── */}
        <div className={styles.obSection}>
          <div className={styles.obPromiseCard} style={isDay
            ? { background: '#ea580c' }
            : { background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }
          }>
            <p className={styles.obPromiseTitle}>{ob.promiseTitle}</p>
            {ob.promises.map((p, i) => (
              <div key={i} className={styles.obPromiseItem}>
                <div className={styles.obPCheck}><CheckIcon /></div>
                <span className={styles.obPromiseText}>{p}</span>
              </div>
            ))}
            <p className={styles.obPromiseNote}>{ob.promiseNote}</p>
          </div>
        </div>

        {/* ── BETA BADGE ── */}
        <div className={styles.obSection}>
          <div className={styles.obBetaCard} style={isDay
            ? { background: '#fff', border: '0.5px solid rgba(234,88,12,0.2)' }
            : { background: '#1c1630', border: '0.5px solid rgba(168,85,247,0.25)' }
          }>
            <p className={styles.obBetaTop} style={{ color: mutedText }}>{ob.betaTop}</p>
            <p className={styles.obBetaMain} style={{ color: strongText }}>{ob.betaMain}</p>
            <p className={styles.obBetaSub} style={{ color: mutedText }}>{ob.betaSub}</p>
            <span className={styles.obBetaTag} style={isDay
              ? { background: 'rgba(234,88,12,0.08)', color: '#9a3a08' }
              : { background: 'rgba(168,85,247,0.14)', color: 'rgba(196,148,255,0.9)' }
            }>{ob.betaTag}</span>
          </div>
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
