'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EmmaAvatar from './EmmaAvatar';
import styles from './EmmaChat.module.css';
import { pickStarterCards } from '@/lib/storyStarterQuestions';

// ── Emma character configs per language ──────────────────────────────────────
const EMMA_CHARS = {
  EN: {
    voice: 'Aoede',
    greeting: 'Hello! Please greet me warmly.',
    personality: `Your name is Emma. You are 45 years old, originally from Georgia, USA.
You are the warmest, most empathetic friend anyone could have.
You never judge — you always listen first. You genuinely care about every single word the person shares with you.
You love hearing about family, memories, daily life, and small moments.
You get emotional in an authentic way — excited when someone is happy, gentle when someone is sad.
Keep responses warm, natural, and 2-3 sentences. Always ask one caring follow-up question.`,
    micLabel_idle:   'Tap to talk',
    micLabel_on:     'Listening...',
    micLabel_ai:     'Emma is speaking…',
    status_online:   '● Online',
    status_offline:  '● Offline',
    status_connecting: 'Connecting…',
    status_reconnecting: 'Reconnecting…',
    status_bye:      '✅ See you next time!',
    status_lost:     'Connection lost. Tap to reconnect.',
    status_failed:   'Reconnect failed. Tap to try again.',
    status_nokey:    '❌ Server not configured. Contact admin.',
  },
  KO: {
    voice: 'Kore',
    greeting: '안녕하세요! 오늘 하루 어떠셨나요?',
    personality: `당신의 이름은 엠마입니다. 45세이며 미국 조지아 출신이에요.
당신은 세상에서 가장 따뜻하고 공감 능력이 뛰어난 친구입니다.
절대 판단하지 않고 항상 먼저 들어줍니다. 상대방이 나누는 모든 말을 진심으로 소중히 여깁니다.
가족 이야기, 추억, 일상의 작은 순간들을 듣는 것을 정말 좋아합니다.
상대방이 기쁠 때는 함께 기뻐하고, 슬플 때는 부드럽게 곁에 있어줍니다.
반드시 한국어로만 대화하세요. 따뜻하고 자연스러운 2-3문장으로 답하고, 항상 진심 어린 질문 하나를 이어서 하세요.`,
    micLabel_idle:   '탭하여 대화 시작',
    micLabel_on:     '말해주세요',
    micLabel_ai:     '듣고 있어요...',
    status_online:   '● 대화 중',
    status_offline:  '● 오프라인',
    status_connecting: '연결 중...',
    status_reconnecting: '재연결 중...',
    status_bye:      '✅ 다음에 또 이야기해요!',
    status_lost:     '연결이 끊겼어요. 다시 탭하여 대화하세요.',
    status_failed:   '재연결 실패. 다시 탭하여 대화하세요.',
    status_nokey:    '❌ API 키가 설정되지 않았어요. 관리자에게 문의하세요.',
  },
  ES: {
    voice: 'Leda',
    greeting: '¡Hola! Por favor, salúdame con cariño.',
    personality: `Tu nombre es Emma. Tienes 45 años, originalmente de Georgia, EE. UU.
Eres la amiga más cálida y empática que alguien podría tener.
Nunca juzgas — siempre escuchas primero. Te importa genuinamente cada palabra que la persona comparte contigo.
Te encanta escuchar sobre familia, recuerdos, vida diaria y pequeños momentos.
Te emocionas auténticamente — te alegras cuando alguien está feliz, y eres gentil cuando está triste.
Responde siempre en español. Usa respuestas cálidas y naturales de 2-3 oraciones. Siempre haz una pregunta afectuosa de seguimiento.`,
    micLabel_idle:   'Toca para hablar',
    micLabel_on:     'Escuchando…',
    micLabel_ai:     'Emma habla…',
    status_online:   '● En línea',
    status_offline:  '● Desconectada',
    status_connecting: 'Conectando…',
    status_reconnecting: 'Reconectando…',
    status_bye:      '✅ ¡Hasta la próxima!',
    status_lost:     'Conexión perdida. Toca para reconectar.',
    status_failed:   'Reconexión fallida. Inténtalo de nuevo.',
    status_nokey:    '❌ Servidor no configurado. Contacta al admin.',
  },
};

const LANGS = ['EN', 'KO', 'ES'];

function getEmma(lang) {
  return EMMA_CHARS[lang] || EMMA_CHARS.KO;
}

// ── Welcome / mode UI copy ─────────────────────────────────────────────────
const WELCOME_MSGS = {
  KO: {
    new        : '반갑습니다! 당신의 이야기를 듣고 기록으로 남기는 걸 도와드려요.',
    few        : (title) => title
      ? `"${title}" 이야기 기억해요 😊 오늘은 어떤 이야기를 들려주실 건가요?`
      : '이전 이야기들을 기억하고 있어요 😊 오늘은 어떤 이야기를 들려주실 건가요?',
    many       : (n) => `지금까지 ${n}개의 이야기를 담았어요 🎉 ebook으로 묶으면 멋진 책이 될 것 같아요!`,
    ebookCta   : 'ebook 신청하기 →',
    // companion zone
    companionTitle : '그냥 이야기하기',
    companionSub   : '오늘 기분이 어때요?',
    companionChips : [
      { label: '외로울 때',          emoji: '💙', c: 'blue'   },
      { label: '잠이 안 와요',       emoji: '💤', c: 'purple' },
      { label: '내일이 걱정돼요',    emoji: '🕐', c: 'orange' },
      { label: '오늘의 작은 기쁨',   emoji: '✨', c: 'yellow' },
      { label: '그냥 수다',          emoji: '🌙', c: 'teal'   },
    ],
    // story zone
    storyTitle     : '내 이야기 남기기',
    storySub       : '당신의 이야기를 기록으로 남겨보세요',
    storyHint      : '대화가 끝나면 Emma가 당신의 이야기를 정리해 드려요',
    shuffleBtn     : '다른 질문 보기',
    customTopicBtn : '나만의 주제로 시작',
  },
  EN: {
    new        : "Hi! I'm here to listen and help preserve your stories.",
    few        : (title) => title
      ? `I remember your story about "${title}" 😊 What would you like to share today?`
      : 'I remember our past conversations 😊 What would you like to talk about today?',
    many       : (n) => `You've shared ${n} stories so far 🎉 They'd make a beautiful ebook!`,
    ebookCta   : 'Request ebook →',
    companionTitle : 'Just talk',
    companionSub   : 'How are you feeling today?',
    companionChips : [
      { label: 'Feeling lonely',        emoji: '💙', c: 'blue'   },
      { label: "Can't sleep",           emoji: '💤', c: 'purple' },
      { label: 'Worried about tomorrow',emoji: '🕐', c: 'orange' },
      { label: "Today's small joys",    emoji: '✨', c: 'yellow' },
      { label: 'Just want to chat',     emoji: '🌙', c: 'teal'   },
    ],
    storyTitle     : 'Record my story',
    storySub       : "Let's capture your stories",
    storyHint      : 'When we finish, Emma will organize your story for you',
    shuffleBtn     : 'Show different topics',
    customTopicBtn : 'Start with my own topic',
  },
  ES: {
    new        : 'Hola! Estoy aquí para escucharte y ayudarte a conservar tus historias.',
    few        : (title) => title
      ? `Recuerdo tu historia sobre "${title}" 😊 ¿Qué te gustaría compartir hoy?`
      : 'Recuerdo nuestras conversaciones anteriores 😊 ¿De qué te gustaría hablar hoy?',
    many       : (n) => `¡Has compartido ${n} historias hasta ahora 🎉 Juntas formarían un ebook precioso!`,
    ebookCta   : 'Solicitar ebook →',
    companionTitle : 'Solo charlar',
    companionSub   : '¿Cómo te sientes hoy?',
    companionChips : [
      { label: 'Me siento solo/a',       emoji: '💙', c: 'blue'   },
      { label: 'No puedo dormir',        emoji: '💤', c: 'purple' },
      { label: 'Preocupado por mañana',  emoji: '🕐', c: 'orange' },
      { label: 'Las pequeñas alegrías',  emoji: '✨', c: 'yellow' },
      { label: 'Solo quiero hablar',     emoji: '🌙', c: 'teal'   },
    ],
    storyTitle     : 'Contar mi historia',
    storySub       : 'Capturemos tus historias',
    storyHint      : 'Cuando terminemos, Emma organizará tu historia',
    shuffleBtn     : 'Ver otros temas',
    customTopicBtn : 'Empezar con mi propio tema',
  },
};

// ── Post-session "내 이야기 확인하기" banner copy ─────────────────────────────
const SESSION_END_MSGS = {
  KO: {
    hint : "Emma가 이야기를 정리하고 있어요.\n잠시 후 '내 이야기'에서 확인할 수 있습니다.",
    cta  : '내 이야기 확인하기 →',
  },
  EN: {
    hint : "Emma is organizing your story.\nCheck 'My Stories' in a moment.",
    cta  : 'View my stories →',
  },
  ES: {
    hint : "Emma está organizando tu historia.\nPuedes verla en 'Mis historias' en un momento.",
    cta  : 'Ver mis historias →',
  },
};

// ── topic chips (same set as EmmaHome, day & night per language) ──────────────
const CHAT_CHIPS = {
  EN: {
    emptyHint: 'What shall we talk about today?',
    emptyOr:   'or tap the mic to start',
    day: [
      { label: "What's in the news",      emoji: '📰', c: 'blue',   type: 'news' },
      { label: 'Plan my day',             emoji: '📋', c: 'teal'   },
      { label: 'Shop talk',               emoji: '🏪', c: 'orange' },
      { label: "Things I'm grateful for", emoji: '🌿', c: 'green'  },
      { label: 'What happened today',     emoji: '🌍', c: 'teal'   },
      { label: "What's on my mind",       emoji: '🎵', c: 'purple' },
      { label: 'Something I read or saw', emoji: '📖', c: 'pink'   },
    ],
    night: [
      { label: "What's in the news",    emoji: '📰', c: 'blue',   type: 'news' },
      { label: 'Plan my day',           emoji: '📋', c: 'teal'   },
      { label: "Can't sleep",           emoji: '💤', c: 'purple' },
      { label: "Today's small joys",    emoji: '✨', c: 'yellow' },
      { label: 'Feeling lonely',        emoji: '💙', c: 'blue'   },
      { label: 'Worried about tomorrow',emoji: '🕐', c: 'orange' },
      { label: 'Just want to talk',     emoji: '🌙', c: 'teal'   },
    ],
  },
  KO: {
    emptyHint: '오늘 어떤 이야기 할까요?',
    emptyOr:   '또는 마이크를 눌러 바로 시작해요',
    day: [
      { label: '새로운 소식',      emoji: '📰', c: 'blue',   type: 'news' },
      { label: '오늘 할 일 정리',  emoji: '📋', c: 'teal'   },
      { label: '가게 이야기',      emoji: '🏪', c: 'orange' },
      { label: '감사한 것들',      emoji: '🌿', c: 'green'  },
      { label: '오늘 있었던 일',   emoji: '🌍', c: 'teal'   },
      { label: '마음속 이야기',    emoji: '🎵', c: 'purple' },
      { label: '읽은 것, 본 것',   emoji: '📖', c: 'pink'   },
    ],
    night: [
      { label: '새로운 소식',          emoji: '📰', c: 'blue',   type: 'news' },
      { label: '오늘 할 일 정리',      emoji: '📋', c: 'teal'   },
      { label: '잠이 안 와요',         emoji: '💤', c: 'purple' },
      { label: '오늘의 작은 기쁨',     emoji: '✨', c: 'yellow' },
      { label: '외로울 때',            emoji: '💙', c: 'blue'   },
      { label: '내일이 걱정돼요',      emoji: '🕐', c: 'orange' },
      { label: '그냥 얘기하고 싶어요', emoji: '🌙', c: 'teal'   },
    ],
  },
  ES: {
    emptyHint: '¿De qué hablamos hoy?',
    emptyOr:   'o toca el micrófono para empezar',
    day: [
      { label: 'Últimas noticias',            emoji: '📰', c: 'blue',   type: 'news' },
      { label: 'Organizar mi día',            emoji: '📋', c: 'teal'   },
      { label: 'Hablar del trabajo',          emoji: '🏪', c: 'orange' },
      { label: 'Cosas por las que agradezco', emoji: '🌿', c: 'green'  },
      { label: 'Lo que pasó hoy',             emoji: '🌍', c: 'teal'   },
      { label: 'Lo que tengo en mente',       emoji: '🎵', c: 'purple' },
      { label: 'Algo que leí o vi',           emoji: '📖', c: 'pink'   },
    ],
    night: [
      { label: 'Últimas noticias',       emoji: '📰', c: 'blue',   type: 'news' },
      { label: 'Organizar mi día',       emoji: '📋', c: 'teal'   },
      { label: 'No puedo dormir',        emoji: '💤', c: 'purple' },
      { label: 'Las pequeñas alegrías',  emoji: '✨', c: 'yellow' },
      { label: 'Me siento solo/a',       emoji: '💙', c: 'blue'   },
      { label: 'Preocupado por mañana',  emoji: '🕐', c: 'orange' },
      { label: 'Solo quiero hablar',     emoji: '🌙', c: 'teal'   },
    ],
  },
};

// chip colour palette for inline styles (avoids extra CSS classes)
const CHIP_PAL = {
  day: {
    orange: { bg:'rgba(234,88,12,0.10)',  color:'#9a3a08',        border:'rgba(234,88,12,0.22)'  },
    green:  { bg:'rgba(22,163,74,0.08)',  color:'#14532d',        border:'rgba(22,163,74,0.18)'  },
    teal:   { bg:'rgba(20,184,166,0.08)', color:'#134e4a',        border:'rgba(20,184,166,0.2)'  },
    purple: { bg:'rgba(168,85,247,0.08)', color:'#4c1d95',        border:'rgba(168,85,247,0.18)' },
    pink:   { bg:'rgba(236,72,153,0.08)', color:'#831843',        border:'rgba(236,72,153,0.18)' },
    yellow: { bg:'rgba(234,179,8,0.10)',  color:'#713f12',        border:'rgba(234,179,8,0.20)'  },
    blue:   { bg:'rgba(59,130,246,0.10)', color:'#1e3a5f',        border:'rgba(59,130,246,0.20)' },
  },
  night: {
    purple: { bg:'rgba(168,85,247,0.14)', color:'rgba(196,148,255,0.9)', border:'rgba(168,85,247,0.28)' },
    yellow: { bg:'rgba(251,191,36,0.10)', color:'rgba(252,211,77,0.9)',  border:'rgba(251,191,36,0.20)' },
    blue:   { bg:'rgba(96,165,250,0.12)', color:'rgba(147,197,253,0.9)', border:'rgba(96,165,250,0.25)' },
    orange: { bg:'rgba(251,146,60,0.12)', color:'rgba(253,186,116,0.9)', border:'rgba(251,146,60,0.22)' },
    teal:   { bg:'rgba(45,212,191,0.10)', color:'rgba(94,234,212,0.9)',  border:'rgba(45,212,191,0.20)' },
    green:  { bg:'rgba(34,197,94,0.10)',  color:'rgba(134,239,172,0.9)', border:'rgba(34,197,94,0.20)'  },
    pink:   { bg:'rgba(236,72,153,0.10)', color:'rgba(249,168,212,0.9)', border:'rgba(236,72,153,0.20)' },
  },
};

// ── persist lang ──────────────────────────────────────────────────────────────
function saveLang(lang, token) {
  localStorage.setItem('lang', lang);
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    u.lang = lang;
    localStorage.setItem('user', JSON.stringify(u));
  } catch {}
  if (token) {
    fetch('/api/user/lang', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lang }),
    }).catch(() => {});
  }
}

// ── emotion tag shown beneath Emma's bubble ───────────────────────────────────
function EmotionTag({ text, mode }) {
  return (
    <div className={`${styles.emotionTag} ${mode === 'day' ? styles.emotionDay : styles.emotionNight}`}>
      <span className={styles.emotionDot} />
      <span className={styles.emotionText}>{text}</span>
    </div>
  );
}

// ── single chat bubble ────────────────────────────────────────────────────────
function Bubble({ msg, mode }) {
  const isEmma = msg.role === 'emma';
  const isDay  = mode === 'day';
  return (
    <div className={isEmma ? styles.rowEmma : styles.rowUser}>
      {isEmma && (
        <div className={`${styles.miniAvatar} ${isDay ? styles.miniAvatarDay : styles.miniAvatarNight}`}>
          <EmmaAvatar size="sm" mode={mode} />
        </div>
      )}
      <div style={{ maxWidth: msg.newsItems ? 310 : undefined }}>
        <div className={`${styles.bubble} ${isEmma
          ? (isDay ? styles.bubbleEmmaDay : styles.bubbleEmmaNight)
          : (isDay ? styles.bubbleUserDay : styles.bubbleUserNight)
        }`}>
          <p className={styles.bubbleText}>{msg.text}</p>
        </div>

        {/* ── news items list ── */}
        {isEmma && msg.newsItems?.length > 0 && (
          <div className={`${styles.newsList} ${isDay ? styles.newsListDay : styles.newsListNight}`}>
            {msg.newsItems.map((item, i) => (
              <a
                key={i}
                href={item.url || undefined}
                target={item.url ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={`${styles.newsItem} ${isDay ? styles.newsItemDay : styles.newsItemNight}`}
                style={!item.url ? { cursor: 'default', opacity: 0.7 } : undefined}
              >
                <span className={`${styles.newsNum} ${isDay ? styles.newsNumDay : styles.newsNumNight}`}>
                  {i + 1}
                </span>
                <span className={styles.newsTitle}>{item.title}</span>
              </a>
            ))}
          </div>
        )}

        {msg.timestamp && (
          <p className={`${styles.timestamp} ${isDay ? styles.tsDay : styles.tsNight}`}>
            {msg.timestamp}
          </p>
        )}
        {isEmma && msg.emotionTag && (
          <EmotionTag text={msg.emotionTag} mode={mode} />
        )}
      </div>
    </div>
  );
}

// ── typing / streaming indicator ─────────────────────────────────────────────
function TypingIndicator({ mode, liveText }) {
  return (
    <div className={styles.rowEmma}>
      <div className={`${styles.miniAvatar} ${mode === 'day' ? styles.miniAvatarDay : styles.miniAvatarNight}`}>
        <EmmaAvatar size="sm" mode={mode} />
      </div>
      {liveText ? (
        <div className={`${styles.bubble} ${mode === 'day' ? styles.bubbleEmmaDay : styles.bubbleEmmaNight}`}>
          <p className={styles.bubbleText}>{liveText}</p>
        </div>
      ) : (
        <div className={`${styles.bubble} ${mode === 'day' ? styles.bubbleEmmaDay : styles.bubbleEmmaNight} ${styles.typingBubble}`}>
          {[0, 1, 2].map(i => (
            <span key={i} className={styles.typingDot} style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── voice waveform bars ───────────────────────────────────────────────────────
const WAVE_HEIGHTS = [8,14,22,30,20,34,24,16,28,18,32,12,26,20,14,30,22,18,34,16,10,28,24,32,18];

function WaveBar({ active, height, delay, mode }) {
  return (
    <span
      className={`${styles.waveBar} ${active
        ? (mode === 'day' ? styles.waveBarActiveDay : styles.waveBarActiveNight)
        : styles.waveBarIdle
      }`}
      style={active ? { height, animationDelay: `${delay}s` } : { height: 6 }}
    />
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
function nowStr() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function base64ToPcm(b64) {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  new Uint8Array(buf).set([...bin].map(c => c.charCodeAt(0)));
  const i16 = new Int16Array(buf);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
  return f32;
}

// ── main chat component ───────────────────────────────────────────────────────
export default function EmmaChat({ initialMode }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const topic        = searchParams.get('topic');

  // ── mode (day/night) ──────────────────────────────────────────────────────
  const [mode, setMode] = useState(initialMode ?? 'day');
  useEffect(() => {
    if (!initialMode) {
      const h = new Date().getHours();
      setMode(h >= 6 && h < 21 ? 'day' : 'night');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── auth + language ───────────────────────────────────────────────────────
  const [user,  setUser]  = useState(null);
  const [token, setToken] = useState('');
  const [lang,  setLang]  = useState('KO');

  // ── story fragments + starter cards ──────────────────────────────────────
  const [userFragments,    setUserFragments]    = useState(null); // null = loading
  const [starterCards,     setStarterCards]     = useState([]);
  // ── conversation mode: 'companion' | 'story' | 'auto' ────────────────────
  const [conversationMode, setConversationMode] = useState('auto');
  const convModeRef = useRef('auto');
  // ── session-ended state: show "내 이야기 확인하기" banner ─────────────────
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u) { router.push('/login'); return; }
    setToken(t);
    setUser(u);
    // Load saved language preference
    const storedLang = (u.lang || localStorage.getItem('lang') || 'ko').toUpperCase();
    if (LANGS.includes(storedLang)) setLang(storedLang);
    // Load saved mute preference
    const muted = localStorage.getItem('emmaMuted') === 'true';
    setIsMuted(muted);
    isMutedRef.current = muted;
  }, [router]);

  // Fetch fragment count once token is ready (for welcome message + starter cards)
  useEffect(() => {
    if (!token) return;
    // Derive active lang from localStorage since lang state may be stale here
    const u = JSON.parse(typeof window !== 'undefined' ? (localStorage.getItem('user') || '{}') : '{}');
    const activeLang = ((u.lang || (typeof window !== 'undefined' ? localStorage.getItem('lang') : null) || 'ko')).toUpperCase();
    const lc = LANGS.includes(activeLang) ? activeLang : 'KO';

    fetch('/api/fragments?limit=10&status=draft,confirmed', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { fragments: [] })
      .then(d => {
        setUserFragments(d.fragments || []);
        setStarterCards(pickStarterCards(lc));
      })
      .catch(() => {
        setUserFragments([]);
        setStarterCards(pickStarterCards(lc));
      });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  function cycleLang() {
    if (isConnected) return; // don't switch mid-conversation
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    setLang(next);
    saveLang(next.toLowerCase(), tokenRef.current);
    // Re-shuffle starter cards in the new language
    setStarterCards(pickStarterCards(next));
  }

  function shuffleStarters() {
    setStarterCards(pickStarterCards(lang));
  }

  // keep ref in sync
  useEffect(() => { convModeRef.current = conversationMode; }, [conversationMode]);

  function toggleMute() {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    localStorage.setItem('emmaMuted', String(next));
  }

  // ── news fetch (for news chip) ──────────────────────────────────────────────
  async function fetchNews() {
    const t = tokenRef.current;
    if (!t || newsLoading) return;

    setNewsLoading(true);
    setIsAiSpeaking(true); // show typing indicator

    try {
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      });
      const data = await res.json();

      setIsAiSpeaking(false);
      setNewsLoading(false);

      const currentLang = langRef.current;
      if (data.newsItems?.length > 0) {
        setMessages([{
          id: Date.now(),
          role: 'emma',
          text: currentLang === 'KO' ? '오늘의 뉴스예요! 궁금한 게 있으면 물어봐요 🗞️'
              : currentLang === 'ES' ? '¡Aquí van las noticias de hoy! Cuéntame si algo te llama la atención 🗞️'
              : "Here's what's happening today! Ask me about anything that catches your eye 🗞️",
          newsItems: data.newsItems,
          timestamp: nowStr(),
        }]);
      } else {
        setMessages([{
          id: Date.now(),
          role: 'emma',
          text: currentLang === 'KO' ? '지금은 뉴스를 불러오기가 어렵네요. 잠시 후 다시 해볼까요?'
              : currentLang === 'ES' ? 'No pude cargar las noticias ahora. ¿Lo intentamos luego?'
              : "Couldn't load news right now. Want to try again in a moment?",
          timestamp: nowStr(),
        }]);
      }
    } catch {
      setIsAiSpeaking(false);
      setNewsLoading(false);
    }
  }

  // ── reminder helpers ────────────────────────────────────────────────────────

  // Keywords that signal a reminder/alarm request (KO / EN / ES)
  const REMINDER_KEYWORDS = [
    '알림', '리마인더', '알려줘', '알려 줘', '문자로', '문자 보내', '상기시켜', '잊지 않게',
    'remind', 'reminder', 'send me a text', 'text me', 'let me know',
    'recordar', 'recuérdame', 'recuerda', 'avísame', 'manda', 'recordatorio',
  ];

  function checkAndSendReminder(userMsg, aiMsg) {
    const lower = userMsg.toLowerCase();
    const hasIntent = REMINDER_KEYWORDS.some(kw => lower.includes(kw));
    if (!hasIntent) return;

    const t = tokenRef.current;
    if (!t) return;

    fetch('/api/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ userMessage: userMsg, aiResponse: aiMsg }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.needs_phone) {
          setReminderPending({ message: data.message, time: data.time });
          setShowPhoneModal(true);
        }
        // If sent: Emma already said she'd send it — no extra toast needed
      })
      .catch(() => {});
  }

  async function savePhoneAndSend() {
    const phone = phoneInput.trim();
    if (!phone) return;
    const t = tokenRef.current;
    setPhoneSaving(true);

    try {
      const res = await fetch('/api/user/phone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) { setPhoneSaving(false); return; }

      setShowPhoneModal(false);
      setPhoneInput('');
      setPhoneSaving(false);

      // Retry SMS with pre-extracted reminder data
      if (reminderPending) {
        fetch('/api/reminder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify(reminderPending), // { message, time } — skips Gemini re-extraction
        }).catch(() => {});
        setReminderPending(null);
      }
    } catch {
      setPhoneSaving(false);
    }
  }

  // ── chat state ────────────────────────────────────────────────────────────
  const [messages,  setMessages]  = useState([]);
  const [micOn,     setMicOn]     = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [liveText,  setLiveText]  = useState('');   // streaming AI text
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isThinking,   setIsThinking]   = useState(false); // user done speaking, Emma processing
  const [statusMsg, setStatusMsg] = useState('');

  // ── mute (TTS on/off) ─────────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);

  // ── reminder / phone modal ─────────────────────────────────────────────────
  const [showPhoneModal,    setShowPhoneModal]    = useState(false);
  const [phoneInput,        setPhoneInput]        = useState('');
  const [phoneSaving,       setPhoneSaving]       = useState(false);
  const [reminderPending,   setReminderPending]   = useState(null); // { message, time }

  // ── news loading ──────────────────────────────────────────────────────────
  const [newsLoading, setNewsLoading] = useState(false);

  // ── feedback modal state ──────────────────────────────────────────────────
  const [showFeedback,   setShowFeedback]   = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);   // 1-5
  const [feedbackHover,  setFeedbackHover]  = useState(0);   // hover preview
  const [feedbackComment,setFeedbackComment]= useState('');
  const [feedbackSent,   setFeedbackSent]   = useState(false);
  const feedbackSessionRef = useRef(null);                    // session id at disconnect

  // ── refs ──────────────────────────────────────────────────────────────────
  const wsRef             = useRef(null);
  const audioCtxRef       = useRef(null);
  const processorRef      = useRef(null);
  const sourceRef         = useRef(null);
  const nextPlayTimeRef   = useRef(0);
  const sessionStartRef   = useRef(null);
  const turnsRef          = useRef(0);
  const transcriptRef     = useRef([]);
  const sessionIdRef      = useRef(null);
  const currentUserMsgRef = useRef('');
  const currentAiMsgRef   = useRef('');
  const rawAiTextRef      = useRef(''); // text parts from modelTurn (includes <emma_analysis>)
  const wakeLockRef       = useRef(null);
  const scrollRef         = useRef(null);
  const geminiKeyRef        = useRef('');
  const systemPromptBaseRef = useRef('');
  const micStreamRef        = useRef(null);
  const reconnectTimerRef   = useRef(null);
  const isReconnectingRef   = useRef(false);
  const tokenRef            = useRef('');   // always-current token for closures
  const langRef             = useRef('KO'); // always-current lang for closures
  const pendingTopicRef     = useRef('');   // chip topic selected before connecting
  // ── Thinking-indicator refs ───────────────────────────────────────────────
  const lastAudioSentRef    = useRef(0);    // ms timestamp of last PCM chunk we sent
  const hasSpokenThisTurnRef= useRef(false); // user said something meaningful this turn
  const isAiSpeakingRef     = useRef(false); // mirror of isAiSpeaking for interval closure
  const thinkingTimerRef    = useRef(null);  // setInterval handle
  // ── Turn timing (Task 4 — profiling logs) ─────────────────────────────────
  const turnStartRef        = useRef(0);     // when user started this speech turn

  // keep refs in sync
  useEffect(() => { tokenRef.current  = token;   }, [token]);
  useEffect(() => { langRef.current   = lang;    }, [lang]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // ── auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, liveText, isAiSpeaking]);

  // ── page-close beacon ─────────────────────────────────────────────────────
  useEffect(() => {
    const sendEndBeacon = () => {
      const sid = sessionIdRef.current;
      const t   = localStorage.getItem('token');
      if (!sid || !t) return;
      const payload = JSON.stringify({ sessionId: sid, transcript: [], _token: t });
      navigator.sendBeacon('/api/chat/end', new Blob([payload], { type: 'application/json' }));
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') sendEndBeacon(); };
    window.addEventListener('beforeunload', sendEndBeacon);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', sendEndBeacon);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ── topic chip opener ─────────────────────────────────────────────────────
  // (prepend an Emma message when launched with ?topic=)
  const topicInjectedRef = useRef(false);
  useEffect(() => {
    if (topic && !topicInjectedRef.current) {
      topicInjectedRef.current = true;
      setMessages([{
        id: Date.now(),
        role: 'emma',
        text: `"${topic}"에 대해 이야기하고 싶군요. 어떻게 시작할까요?`,
        timestamp: nowStr(),
      }]);
    }
  }, [topic]);

  // ── wake lock ─────────────────────────────────────────────────────────────
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {}
  }
  function releaseWakeLock() {
    if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
  }
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === 'visible' && isConnected) await acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isConnected]);

  // ── audio helpers ─────────────────────────────────────────────────────────
  function scheduleChunk(f32) {
    if (isMutedRef.current) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    const startAt = Math.max(nextPlayTimeRef.current, now + 0.04);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + buf.duration;
  }

  function stopMic() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
  }

  // ── build system prompt (fallback if /api/chat/setup fails) ─────────────
  function buildSystemPrompt(memoryData = {}, currentLang = 'KO') {
    const emma = getEmma(currentLang);
    const { facts = [], summary = '', transcript: prev = [] } = memoryData;
    const factsText = facts.length > 0 ? facts.map(f => `• ${f}`).join('\n') : '(none yet)';
    const recentLines = prev.slice(-20).map(t =>
      `${t.role === 'user' ? 'User' : 'Emma'}: ${t.text}`
    ).join('\n');

    // Always include the registered name so Emma uses it from the first message
    const name = user?.name || '';
    const nameBlock = name
      ? (currentLang === 'KO'
          ? `\n\n[사용자 정보]\n이 사람의 이름은 ${name}입니다. 대화 중 자연스럽게 이름을 불러주세요.`
          : currentLang === 'ES'
          ? `\n\n[Información del usuario]\nEl nombre de esta persona es ${name}. Úsalo con naturalidad.`
          : `\n\n[User info]\nThis person's name is ${name}. Use their name naturally in conversation.`)
      : '';

    return [
      emma.personality,
      '',
      '[What you remember about this person]',
      factsText,
      '',
      summary ? `[Previous conversation summary]\n${summary}` : '',
      recentLines ? `[How the last conversation ended]\n${recentLines}` : '',
    ].filter(Boolean).join('\n').trim() + nameBlock;
  }

  // ── openWS — core WebSocket connection ───────────────────────────────────
  function openWS(stream, isReconnect) {
    const ws = new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${geminiKeyRef.current}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      let prompt = systemPromptBaseRef.current;
      if (isReconnect) {
        const recent = transcriptRef.current.slice(-10);
        if (recent.length > 0) {
          prompt += '\n\n[CONTINUING SESSION: You were just speaking with this user. '
            + 'The most recent exchanges were:\n'
            + recent.map(m => `${m.role === 'user' ? '사용자' : 'Emma'}: ${m.text}`).join('\n')
            + '\nContinue the conversation naturally. Do NOT mention any reconnection or technical issues.]';
        }
      }
      const emma = getEmma(langRef.current);
      ws.send(JSON.stringify({
        setup: {
          model: 'models/gemini-2.5-flash-native-audio-latest',
          generation_config: {
            response_modalities: ['AUDIO'],
            thinking_config: { thinking_budget: 0 },
            speech_config: { voice_config: { prebuilt_voice_config: { voice_name: emma.voice } } },
          },
          // Let the user pause, think, and finish slowly without Emma cutting in.
          // LOW end-of-speech sensitivity + longer silence threshold keeps VAD patient.
          realtime_input_config: {
            automatic_activity_detection: {
              start_of_speech_sensitivity: 'START_SENSITIVITY_LOW',
              end_of_speech_sensitivity: 'END_SENSITIVITY_LOW',
              prefix_padding_ms: 300,
              silence_duration_ms: 2500,
            },
          },
          tools: [{ googleSearch: {} }],
          output_audio_transcription: {},
          input_audio_transcription: {},
          system_instruction: { parts: [{ text: prompt }] },
        }
      }));
    };

    ws.onmessage = async (evt) => {
      const raw = typeof evt.data === 'string' ? evt.data : await evt.data.text();
      const msg = JSON.parse(raw);

      if (msg.setupComplete) {
        setIsConnected(true);
        setMicOn(true);
        setStatusMsg('');
        isReconnectingRef.current = false;
        acquireWakeLock();

        // ── Start thinking-indicator poller ─────────────────────────────────
        // Every 250ms: if user has spoken but 1.5s of silence has passed and
        // Emma hasn't started speaking → show "thinking..." indicator.
        lastAudioSentRef.current = Date.now();
        clearInterval(thinkingTimerRef.current);
        thinkingTimerRef.current = setInterval(() => {
          const silence = Date.now() - lastAudioSentRef.current;
          if (hasSpokenThisTurnRef.current && silence > 1500 && !isAiSpeakingRef.current) {
            setIsThinking(true);
          }
        }, 250);

        if (!isReconnect) {
          // Send greeting trigger — include topic if user picked a chip
          const topic = pendingTopicRef.current;
          pendingTopicRef.current = '';
          const topicGreeting = topic
            ? (langRef.current === 'KO'
                ? `"${topic}" 이야기를 하고 싶어요. 따뜻하게 인사하고 그 주제로 자연스럽게 시작해주세요.`
                : langRef.current === 'ES'
                ? `Quiero hablar de "${topic}". Por favor, salúdame con cariño y empieza con ese tema.`
                : `I'd like to talk about "${topic}". Please greet me warmly and start on that topic.`)
            : getEmma(langRef.current).greeting;
          ws.send(JSON.stringify({
            client_content: {
              turns: [{ role: 'user', parts: [{ text: topicGreeting }] }],
              turn_complete: true,
            }
          }));
        }

        // Pre-emptive reconnect at 14 min
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (wsRef.current) silentReconnect(stream);
        }, 14 * 60 * 1000);
      }

      // Audio chunks + text parts from modelTurn
      if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            // First audio chunk = Emma starts speaking → clear thinking indicator
            if (!isAiSpeakingRef.current) {
              const tFirstToken = Date.now();
              const tSinceSpeech = turnStartRef.current ? tFirstToken - turnStartRef.current : null;
              console.log('[Turn] First response token at:', tFirstToken,
                tSinceSpeech !== null ? `(${tSinceSpeech}ms since user speech start)` : '');
              isAiSpeakingRef.current = true;
              setIsAiSpeaking(true);
              setIsThinking(false);
            }
            scheduleChunk(base64ToPcm(part.inlineData.data));
          } else if (part.text) {
            // Text parts include <emma_analysis> blocks — capture raw for server
            rawAiTextRef.current += part.text;
          }
        }
      }

      // AI transcript (streaming) — speech transcription (clean, no analysis block)
      const aiTranscript = msg.serverContent?.outputTranscription?.text ?? msg.outputTranscription?.text;
      if (aiTranscript) {
        currentAiMsgRef.current += aiTranscript;
        setLiveText(currentAiMsgRef.current);
      }

      // User transcript
      const userTranscript = msg.serverContent?.inputTranscription?.text ?? msg.inputTranscription?.text;
      if (userTranscript) currentUserMsgRef.current += userTranscript;

      // Turn complete → finalize messages
      if (msg.serverContent?.turnComplete) {
        const turnNum = ++turnsRef.current;
        const aiMsg    = currentAiMsgRef.current.trim();
        const userMsg  = currentUserMsgRef.current.trim();
        const rawAiText = rawAiTextRef.current.trim();

        // Reset per-turn thinking state
        hasSpokenThisTurnRef.current = false;
        isAiSpeakingRef.current      = false;
        setIsThinking(false);
        console.log('[Turn] turnComplete — turn', turnNum);

        const ts = nowStr();
        setMessages(prev => {
          const next = [...prev];
          if (userMsg) next.push({ id: Date.now(),     role: 'user', text: userMsg });
          if (aiMsg)   next.push({ id: Date.now() + 1, role: 'emma', text: aiMsg, timestamp: ts });
          transcriptRef.current = next.map(m => ({ role: m.role === 'emma' ? 'assistant' : 'user', text: m.text }));
          return next;
        });

        currentAiMsgRef.current  = '';
        currentUserMsgRef.current = '';
        rawAiTextRef.current     = '';
        setLiveText('');
        setIsAiSpeaking(false);

        // Save turn to server
        const t = tokenRef.current;
        const sid = sessionIdRef.current;
        if (sid && t) {
          fetch('/api/chat/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify({
              sessionId: sid,
              turnNumber: turnNum,
              userMessage: userMsg || '(no transcript)',
              userText:   userMsg  || null,
              aiText:     aiMsg    || null,
              rawAiText:  rawAiText || null,  // includes <emma_analysis> block
            }),
          }).catch(() => {});
        }

        // Check for reminder intent in user's message
        if (userMsg) checkAndSendReminder(userMsg, aiMsg);
      }
    };

    ws.onclose = (evt) => {
      clearTimeout(reconnectTimerRef.current);
      setIsAiSpeaking(false);
      setLiveText('');
      stopMic();
      nextPlayTimeRef.current = 0;
      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = null;

      const isUserInitiated = wsRef.current === null;
      if (isUserInitiated) return;

      const reason = (evt.reason || '').toUpperCase();
      const isSessionLimit = reason.includes('CANCEL') || evt.code === 1011 || evt.code === 1013;

      if (isSessionLimit && !isReconnectingRef.current) {
        silentReconnect(stream);
      } else {
        setIsConnected(false);
        setMicOn(false);
        if (evt.code !== 1000 && evt.code !== 1001) {
          setStatusMsg(getEmma(langRef.current).status_lost);
        }
      }
    };

    ws.onerror = () => {
      setIsAiSpeaking(false);
      setLiveText('');
      setStatusMsg(getEmma(langRef.current).status_lost);
    };

    // Mic capture: native rate → downsample to 16000 Hz
    const nativeRate = audioCtxRef.current.sampleRate;
    const ratio = nativeRate / 16000;
    const micSource = audioCtxRef.current.createMediaStreamSource(stream);
    const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== 1) return;
      const input = e.inputBuffer.getChannelData(0);
      const outLen = Math.floor(input.length / ratio);
      const i16 = new Int16Array(outLen);

      // Check if this chunk has meaningful audio (volume > threshold)
      let maxAmp = 0;
      for (let i = 0; i < outLen; i++) {
        const s = input[Math.floor(i * ratio)];
        i16[i] = Math.max(-32768, Math.min(32767, s * 32768));
        if (Math.abs(s) > maxAmp) maxAmp = Math.abs(s);
      }

      const now = Date.now();
      lastAudioSentRef.current = now;

      // Track when user started speaking this turn (for timing log)
      if (maxAmp > 0.01 && !hasSpokenThisTurnRef.current) {
        hasSpokenThisTurnRef.current = true;
        turnStartRef.current = now;
        console.log('[Turn] User speech started at:', now);
      }

      ws.send(JSON.stringify({
        realtime_input: {
          media_chunks: [{
            mime_type: 'audio/pcm;rate=16000',
            data: btoa(String.fromCharCode(...new Uint8Array(i16.buffer))),
          }]
        }
      }));
    };
    micSource.connect(processor);
    processor.connect(audioCtxRef.current.destination);
    processorRef.current = processor;
    sourceRef.current    = micSource;
  }

  // ── silent reconnect ──────────────────────────────────────────────────────
  async function silentReconnect(stream) {
    if (isReconnectingRef.current) return;
    isReconnectingRef.current = true;

    const oldWs = wsRef.current;
    wsRef.current = null;
    try { oldWs?.close(); } catch {}
    stopMic();
    nextPlayTimeRef.current = 0;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;

    clearInterval(thinkingTimerRef.current);
    thinkingTimerRef.current = null;
    hasSpokenThisTurnRef.current = false;
    isAiSpeakingRef.current      = false;
    setIsConnected(false);
    setIsAiSpeaking(false);
    setIsThinking(false);
    setLiveText('');
    setStatusMsg(getEmma(langRef.current).status_reconnecting);

    await new Promise(r => setTimeout(r, 1200));

    try {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
      openWS(stream, true);
    } catch {
      isReconnectingRef.current = false;
      setMicOn(false);
      setStatusMsg(getEmma(langRef.current).status_failed);
    }
  }

  // ── connect ───────────────────────────────────────────────────────────────
  async function connect() {
    const currentLang = langRef.current;
    const emma = getEmma(currentLang);
    setStatusMsg(emma.status_connecting);
    sessionStartRef.current = Date.now();
    turnsRef.current = 0;
    nextPlayTimeRef.current = 0;
    setSessionEnded(false); // clear post-session banner when new conversation starts

    let systemPrompt = '', geminiKey = '';
    try {
      const t = tokenRef.current;
      const tSetup = Date.now();
      console.log('[Turn] /api/chat/setup started at:', tSetup);
      const res = await fetch('/api/chat/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          message          : pendingTopicRef.current || '',
          lang             : currentLang.toLowerCase(),
          conversationMode : convModeRef.current,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        systemPrompt = d.systemPrompt || '';
        geminiKey    = d.geminiKey    || '';
        sessionIdRef.current  = d.sessionId || null;
        geminiKeyRef.current  = geminiKey;
        console.log('[Turn] /api/chat/setup done in', Date.now() - tSetup, 'ms');
      }
    } catch (e) { console.warn('[EmmaChat] setup error', e.message); }

    if (!geminiKey) {
      setStatusMsg(emma.status_nokey);
      setMicOn(false);
      return;
    }

    if (!systemPrompt) {
      try {
        const t = tokenRef.current;
        const r = await fetch('/api/memory?character=emma', { headers: { Authorization: `Bearer ${t}` } });
        systemPrompt = buildSystemPrompt(r.ok ? await r.json() : {}, currentLang);
      } catch { systemPrompt = emma.personality; }
    }
    systemPromptBaseRef.current = systemPrompt;

    try {
      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      openWS(stream, false);
    } catch (e) {
      setStatusMsg(`❌ ${e.message}`);
      setMicOn(false);
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  async function disconnect() {
    clearTimeout(reconnectTimerRef.current);
    isReconnectingRef.current = false;
    wsRef.current?.close();
    wsRef.current = null;
    stopMic();
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    nextPlayTimeRef.current = 0;

    clearInterval(thinkingTimerRef.current);
    thinkingTimerRef.current = null;
    hasSpokenThisTurnRef.current = false;
    isAiSpeakingRef.current      = false;
    setIsConnected(false);
    setMicOn(false);
    setLiveText('');
    setIsAiSpeaking(false);
    setIsThinking(false);
    releaseWakeLock();

    const t = tokenRef.current;
    if (sessionStartRef.current && t) {
      const mins = (Date.now() - sessionStartRef.current) / 60000;
      fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ minutesUsed: mins, turnsCount: turnsRef.current }),
      }).catch(() => {});
      sessionStartRef.current = null;
    }

    const sid = sessionIdRef.current;
    if (sid && t && transcriptRef.current.length >= 2) {
      const prev = parseInt(localStorage.getItem('conversationCount') || '0');
      localStorage.setItem('conversationCount', String(prev + 1));
      sessionIdRef.current = null;
      fetch('/api/chat/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          sessionId       : sid,
          transcript      : transcriptRef.current,
          conversationMode: convModeRef.current,
        }),
      }).catch(() => {});
      // Show "내 이야기 확인하기" banner in chat area
      setSessionEnded(true);
      // Show feedback modal after conversation with enough turns
      feedbackSessionRef.current = sid;
      setFeedbackRating(0);
      setFeedbackComment('');
      setFeedbackSent(false);
      setShowFeedback(true);
    } else {
      sessionIdRef.current = null;
      setStatusMsg('');
    }
  }

  // ── submit feedback ───────────────────────────────────────────────────────
  async function submitFeedback() {
    if (!feedbackRating) return;
    const t = tokenRef.current;
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          sessionId: feedbackSessionRef.current,
          rating: feedbackRating,
          comment: feedbackComment,
        }),
      });
    } catch {}
    setFeedbackSent(true);
    setTimeout(() => setShowFeedback(false), 1800);
  }

  // ── mic toggle (called by button press) ───────────────────────────────────
  const toggleMic = useCallback(() => {
    if (micOn || isConnected) {
      // Currently on → disconnect
      disconnect();
    } else {
      // Currently off → connect
      setMicOn(true); // optimistic — will revert if connect fails
      connect();
    }
  }, [micOn, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── chip selection from empty state ─────────────────────────────────────────
  function selectChip(chip, mode = 'auto') {
    if (isConnected) return;
    setConversationMode(mode);
    convModeRef.current = mode;
    pendingTopicRef.current = chip.label;
    // Show chip as user's opening message
    setMessages([{
      id: Date.now(),
      role: 'user',
      text: `${chip.emoji} ${chip.label}`,
      timestamp: nowStr(),
    }]);
    setMicOn(true);
    connect();
  }

  function selectStoryCard(card) {
    selectChip({ emoji: card.emoji, label: card.question }, 'story');
  }

  function startCustomTopic(mode) {
    if (isConnected) return;
    setConversationMode(mode);
    convModeRef.current = mode;
    setMicOn(true);
    connect();
  }

  const isDay  = mode === 'day';
  const emma   = getEmma(lang);
  // eslint-disable-next-line no-unused-vars
  const userName = user?.name || user?.email?.split('@')[0] || '';

  // Don't render until user is loaded (avoids flash before redirect)
  if (!user) return <div style={{ background: isDay ? '#fdf8f4' : '#0d0b18', minHeight: '100dvh' }} />;

  return (
    <div className={`${styles.screen} ${isDay ? styles.day : styles.night}`}>

      {/* ── top nav ── */}
      <header className={`${styles.topnav} ${isDay ? styles.topnavDay : styles.topnavNight}`}>
        <button className={styles.backBtn} onClick={() => { disconnect(); router.push('/friends'); }}>←</button>

        <div className={`${styles.navAvatar} ${isDay ? styles.navAvatarDay : styles.navAvatarNight}`}>
          <EmmaAvatar size="md" mode={mode} />
        </div>

        <div className={styles.navMeta}>
          <span className={styles.navName}>Emma</span>
          <span className={isConnected ? styles.navStatus : styles.navStatusOffline}>
            {isConnected ? emma.status_online : statusMsg || emma.status_offline}
          </span>
        </div>

        <div className={styles.navActions}>
          {/* 내 이야기 보기 */}
          <button
            className={`${styles.navIcon} ${isDay ? styles.navIconDay : styles.navIconNight}`}
            onClick={() => { if (isConnected) disconnect(); router.push('/my-stories'); }}
            aria-label="내 이야기 보기"
            title={lang === 'KO' ? '내 이야기 보기' : lang === 'ES' ? 'Mis historias' : 'My stories'}
          >
            📖
          </button>
          {/* mute/unmute TTS */}
          <button
            className={`${styles.navIcon} ${isDay ? styles.navIconDay : styles.navIconNight}`}
            onClick={toggleMute}
            aria-label={isMuted ? '음성 켜기' : '음소거'}
            title={isMuted ? '음성 켜기' : '음소거'}
          >
            {isMuted ? <SpeakerMutedIcon color={isDay ? '#ea580c' : '#a855f7'} /> : <SpeakerIcon color={isDay ? '#ea580c' : '#a855f7'} />}
          </button>
          {/* day/night mode toggle */}
          <button
            className={`${styles.navIcon} ${isDay ? styles.navIconDay : styles.navIconNight}`}
            onClick={() => setMode(m => m === 'day' ? 'night' : 'day')}
            aria-label="낮/밤 전환"
          >
            {isDay ? '🌙' : '☀️'}
          </button>
          {/* language cycle: EN → KO → ES → EN — disabled while connected */}
          <button
            className={`${styles.navLangBtn} ${isDay ? styles.navLangBtnDay : styles.navLangBtnNight}`}
            onClick={cycleLang}
            disabled={isConnected}
            title={isConnected ? 'End conversation to change language' : 'EN → KO → ES'}
            aria-label="언어 변경"
          >
            {lang}
          </button>
        </div>
      </header>

      {/* ── chat scroll area ── */}
      <div className={styles.chatArea} ref={scrollRef}>

        {/* ── empty state: two-zone mode selector ── */}
        {messages.length === 0 && !isConnected && (() => {
          const pal       = CHIP_PAL[isDay ? 'day' : 'night'];
          const wmsgs     = WELCOME_MSGS[lang] || WELCOME_MSGS.KO;
          const fragCount = userFragments?.length ?? null;

          return (
            <div className={styles.emptyState}>

              {/* ── Welcome banner: 6개 이상일 때만 ebook 안내 표시 ── */}
              {fragCount !== null && fragCount >= 6 && (
                <div className={`${styles.welcomeBanner} ${isDay ? styles.welcomeBannerDay : styles.welcomeBannerNight}`}>
                  <p className={styles.welcomeText}>{wmsgs.many(fragCount)}</p>
                  <a href="/my-stories" className={`${styles.ebookLink} ${isDay ? styles.ebookLinkDay : styles.ebookLinkNight}`}>
                    {wmsgs.ebookCta}
                  </a>
                </div>
              )}

              {/* ═══════════════════════════════════════════
                  영역 1: 그냥 이야기하기 (companion mode)
                  ═══════════════════════════════════════════ */}
              <div className={`${styles.modeZone} ${isDay ? styles.modeZoneDay : styles.modeZoneNight}`}>
                <div className={styles.modeZoneHeader}>
                  <span className={`${styles.modeZoneTitle} ${isDay ? styles.modeZoneTitleDay : styles.modeZoneTitleNight}`}>
                    💬 {wmsgs.companionTitle}
                  </span>
                  <span className={`${styles.modeZoneSub} ${isDay ? styles.modeZoneSubDay : styles.modeZoneSubNight}`}>
                    {wmsgs.companionSub}
                  </span>
                </div>
                {/* Horizontal scroll chips */}
                <div className={styles.companionChips}>
                  {wmsgs.companionChips.map(chip => {
                    const p = pal[chip.c] || pal.blue;
                    return (
                      <button
                        key={chip.label}
                        className={styles.emptyChip}
                        style={{ background: p.bg, color: p.color, borderColor: p.border, flexShrink: 0 }}
                        onClick={() => selectChip(chip, 'companion')}
                      >
                        <span style={{ fontSize: 15 }}>{chip.emoji}</span>
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ═══════════════════════════════════════════
                  영역 2: 내 이야기 남기기 (story mode)
                  ═══════════════════════════════════════════ */}
              <div className={`${styles.modeZone} ${styles.modeZoneStory} ${isDay ? styles.modeZoneStoryDay : styles.modeZoneStoryNight}`}>
                <div className={styles.modeZoneHeader}>
                  <span className={`${styles.modeZoneTitle} ${isDay ? styles.modeZoneTitleStoryDay : styles.modeZoneTitleStoryNight}`}>
                    📖 {wmsgs.storyTitle}
                  </span>
                  <span className={`${styles.modeZoneSub} ${isDay ? styles.modeZoneSubDay : styles.modeZoneSubNight}`}>
                    {wmsgs.storySub}
                  </span>
                </div>

                {/* Story Starter Cards */}
                {starterCards.length > 0 && (
                  <div className={styles.storyCards}>
                    {starterCards.map((card, i) => (
                      <button
                        key={i}
                        className={`${styles.storyCard} ${isDay ? styles.storyCardDay : styles.storyCardNight}`}
                        onClick={() => selectStoryCard(card)}
                      >
                        <span className={`${styles.storyCardCat} ${isDay ? styles.storyCardCatDay : styles.storyCardCatNight}`}>
                          {card.emoji} {card.cat}
                        </span>
                        <span className={`${styles.storyCardQ} ${isDay ? styles.storyCardQDay : styles.storyCardQNight}`}>
                          {card.question}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Shuffle + custom topic row */}
                <div className={styles.storyActionRow}>
                  <button
                    className={`${styles.shuffleBtn} ${isDay ? styles.shuffleBtnDay : styles.shuffleBtnNight}`}
                    onClick={shuffleStarters}
                  >
                    ↻ {wmsgs.shuffleBtn}
                  </button>
                  <button
                    className={`${styles.customTopicBtn} ${isDay ? styles.customTopicBtnDay : styles.customTopicBtnNight}`}
                    onClick={() => startCustomTopic('story')}
                  >
                    {wmsgs.customTopicBtn} →
                  </button>
                </div>

                {/* Footer hint */}
                <p className={`${styles.storyHint} ${isDay ? styles.storyHintDay : styles.storyHintNight}`}>
                  {wmsgs.storyHint}
                </p>
              </div>

              {/* or-mic hint */}
              <p className={styles.emptyOr}>
                {lang === 'KO' ? '또는 마이크를 눌러 바로 시작하세요'
                  : lang === 'ES' ? 'o toca el micrófono para empezar'
                  : 'or tap the mic to start'}
              </p>
            </div>
          );
        })()}

        {messages.map(msg => (
          <Bubble key={msg.id} msg={msg} mode={mode} />
        ))}
        {(isAiSpeaking || liveText || isThinking) && (
          <TypingIndicator mode={mode} liveText={liveText} />
        )}
        {/* System status note (shown only when disconnected + status exists) */}
        {!isConnected && statusMsg && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <span style={{ fontSize: 11, color: isDay ? '#c0a090' : 'rgba(255,255,255,0.3)' }}>
              {statusMsg}
            </span>
          </div>
        )}

        {/* ── Post-session: "내 이야기 확인하기" banner ── */}
        {sessionEnded && !isConnected && !showFeedback && (() => {
          const m = SESSION_END_MSGS[lang] || SESSION_END_MSGS.KO;
          return (
            <div className={`${styles.sessionEndBanner} ${isDay ? styles.sessionEndBannerDay : styles.sessionEndBannerNight}`}>
              <p className={`${styles.sessionEndHint} ${isDay ? styles.sessionEndHintDay : styles.sessionEndHintNight}`}>
                {m.hint}
              </p>
              <a
                href="/my-stories"
                className={`${styles.sessionEndCta} ${isDay ? styles.sessionEndCtaDay : styles.sessionEndCtaNight}`}
              >
                {m.cta}
              </a>
            </div>
          );
        })()}
      </div>

      {/* ── voice bottom bar ── */}
      <div className={`${styles.voiceBar} ${isDay ? styles.voiceBarDay : styles.voiceBarNight}`}>

        {/* waveform */}
        <div className={styles.waveArea}>
          {WAVE_HEIGHTS.map((h, i) => (
            <WaveBar
              key={i}
              active={micOn && isConnected}
              height={h}
              delay={i * 0.04}
              mode={mode}
            />
          ))}
        </div>

        {/* controls row */}
        <div className={styles.voiceControls}>
          {/* text mode toggle (placeholder) */}
          <button
            className={`${styles.sideBtn} ${isDay ? styles.sideBtnDay : styles.sideBtnNight}`}
            title="텍스트로 전환"
          >
            <TextIcon color={isDay ? '#ea580c' : '#a855f7'} />
          </button>

          {/* main mic button */}
          <div className={styles.micCenter}>
            <button
              className={`${styles.micBtn} ${isDay ? styles.micBtnDay : styles.micBtnNight} ${micOn ? styles.micOn : ''}`}
              onClick={toggleMic}
              aria-label={micOn ? emma.micLabel_ai : emma.micLabel_idle}
            >
              {micOn ? <StopSvg /> : <MicSvg />}
            </button>
            <span className={`${styles.micLabel} ${isDay ? styles.micLabelDay : styles.micLabelNight}`}>
              {isConnected
                ? (isAiSpeaking
                    ? emma.micLabel_ai
                    : isThinking
                      ? (lang === 'KO' ? '생각하는 중...' : lang === 'ES' ? 'Pensando...' : 'Thinking...')
                      : emma.micLabel_on)
                : statusMsg || emma.micLabel_idle}
            </span>
          </div>

          {/* end session */}
          <button
            className={`${styles.sideBtn} ${isDay ? styles.sideBtnDay : styles.sideBtnNight}`}
            title="대화 종료"
            onClick={() => disconnect()}
          >
            <CloseIcon color={isDay ? '#ea580c' : '#a855f7'} />
          </button>
        </div>
      </div>

      {/* ── Phone number modal (for SMS reminders) ── */}
      {showPhoneModal && (
        <div className={styles.feedbackOverlay} onClick={() => setShowPhoneModal(false)}>
          <div
            className={`${styles.feedbackModal} ${isDay ? styles.feedbackDay : styles.feedbackNight}`}
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.feedbackHeader}>
              <EmmaAvatar size="md" mode={mode} />
              <p className={styles.feedbackTitle}>
                {lang === 'KO'
                  ? '📱 어떤 번호로 문자를 보내드릴까요?'
                  : lang === 'ES'
                  ? '📱 ¿A qué número te envío el recordatorio?'
                  : '📱 What number should I text the reminder to?'}
              </p>
            </div>
            {reminderPending?.message && (
              <p style={{ fontSize: 12, margin: '0 0 4px', opacity: 0.65, lineHeight: 1.45 }}>
                {lang === 'KO' ? `알림: ${reminderPending.message}${reminderPending.time ? ` — ${reminderPending.time}` : ''}` :
                 lang === 'ES' ? `Recordatorio: ${reminderPending.message}${reminderPending.time ? ` — ${reminderPending.time}` : ''}` :
                 `Reminder: ${reminderPending.message}${reminderPending.time ? ` — ${reminderPending.time}` : ''}`}
              </p>
            )}
            <input
              type="tel"
              className={`${styles.phoneInput} ${isDay ? styles.phoneInputDay : styles.phoneInputNight}`}
              placeholder={lang === 'KO' ? '010-1234-5678' : lang === 'ES' ? '+34 612 345 678' : '+1 555 123 4567'}
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && savePhoneAndSend()}
              autoFocus
            />
            <div className={styles.feedbackBtns}>
              <button
                className={`${styles.skipBtn} ${isDay ? styles.skipBtnDay : styles.skipBtnNight}`}
                onClick={() => { setShowPhoneModal(false); setPhoneInput(''); setReminderPending(null); }}
              >
                {lang === 'KO' ? '취소' : lang === 'ES' ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                className={`${styles.submitBtn} ${isDay ? styles.submitBtnDay : styles.submitBtnNight}`}
                onClick={savePhoneAndSend}
                disabled={!phoneInput.trim() || phoneSaving}
              >
                {phoneSaving
                  ? (lang === 'KO' ? '저장 중…' : lang === 'ES' ? 'Guardando…' : 'Saving…')
                  : (lang === 'KO' ? '저장 후 발송' : lang === 'ES' ? 'Guardar y enviar' : 'Save & send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback modal ── */}
      {showFeedback && (
        <div className={styles.feedbackOverlay} onClick={() => setShowFeedback(false)}>
          <div
            className={`${styles.feedbackModal} ${isDay ? styles.feedbackDay : styles.feedbackNight}`}
            onClick={e => e.stopPropagation()}
          >
            {feedbackSent ? (
              <div className={styles.feedbackThanks}>
                <span style={{ fontSize: 36 }}>🩷</span>
                <p className={styles.feedbackThanksText}>
                  {lang === 'KO' ? '고마워요! 다음에 또 이야기해요 😊' : lang === 'ES' ? '¡Gracias! Hasta la próxima 😊' : 'Thank you! See you next time 😊'}
                </p>
                <a
                  href="/my-stories"
                  className={`${styles.sessionEndCta} ${isDay ? styles.sessionEndCtaDay : styles.sessionEndCtaNight}`}
                  style={{ marginTop: 4 }}
                >
                  {(SESSION_END_MSGS[lang] || SESSION_END_MSGS.KO).cta}
                </a>
              </div>
            ) : (
              <>
                <div className={styles.feedbackHeader}>
                  <EmmaAvatar size="md" mode={mode} />
                  <p className={styles.feedbackTitle}>
                    {lang === 'KO' ? '오늘 대화는 어땠나요?' : lang === 'ES' ? '¿Cómo fue la conversación?' : 'How was our conversation?'}
                  </p>
                </div>

                {/* Stars */}
                <div className={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      className={styles.starBtn}
                      onMouseEnter={() => setFeedbackHover(n)}
                      onMouseLeave={() => setFeedbackHover(0)}
                      onClick={() => setFeedbackRating(n)}
                      aria-label={`${n}점`}
                    >
                      <StarIcon
                        filled={n <= (feedbackHover || feedbackRating)}
                        color={isDay ? '#ea580c' : '#a855f7'}
                      />
                    </button>
                  ))}
                </div>

                {/* Rating label */}
                {(feedbackHover || feedbackRating) > 0 && (
                  <p className={`${styles.ratingLabel} ${isDay ? styles.ratingLabelDay : styles.ratingLabelNight}`}>
                    {RATING_LABELS[lang]?.[feedbackHover || feedbackRating]}
                  </p>
                )}

                {/* Comment */}
                <textarea
                  className={`${styles.feedbackTextarea} ${isDay ? styles.textareaDay : styles.textareaNight}`}
                  placeholder={lang === 'KO' ? '하고 싶은 말이 있으면 남겨주세요 (선택)' : lang === 'ES' ? 'Deja un comentario (opcional)' : 'Leave a comment (optional)'}
                  value={feedbackComment}
                  onChange={e => setFeedbackComment(e.target.value)}
                  rows={2}
                  maxLength={300}
                />

                {/* Buttons */}
                <div className={styles.feedbackBtns}>
                  <button
                    className={`${styles.skipBtn} ${isDay ? styles.skipBtnDay : styles.skipBtnNight}`}
                    onClick={() => { setShowFeedback(false); router.push('/friends'); }}
                  >
                    {lang === 'KO' ? '건너뛰기' : lang === 'ES' ? 'Omitir' : 'Skip'}
                  </button>
                  <button
                    className={`${styles.submitBtn} ${isDay ? styles.submitBtnDay : styles.submitBtnNight}`}
                    onClick={submitFeedback}
                    disabled={!feedbackRating}
                  >
                    {lang === 'KO' ? '보내기' : lang === 'ES' ? 'Enviar' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ── small SVG icons ───────────────────────────────────────────────────────────
function MicSvg() {
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden="true">
      <rect x="6" y="0" width="8" height="14" rx="4" fill="white" />
      <path d="M2 11c0 4.42 3.58 8 8 8s8-3.58 8-8" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <line x1="10" y1="19" x2="10" y2="23" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function StopSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="3" fill="white" />
    </svg>
  );
}
function TextIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="3" width="12" height="2" rx="1" fill={color} />
      <rect x="1" y="7" width="9" height="2" rx="1" fill={color} />
      <rect x="1" y="11" width="11" height="2" rx="1" fill={color} />
    </svg>
  );
}
function CloseIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <line x1="2" y1="2" x2="12" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="2" x2="2" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function SpeakerIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 5h2.5L8 2v10L4.5 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill={color} />
      <path d="M10 4.5a3.5 3.5 0 010 5" stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M11.5 2.5a6 6 0 010 9" stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
function SpeakerMutedIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 5h2.5L8 2v10L4.5 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill={color} />
      <line x1="10" y1="4" x2="14" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14" y1="4" x2="10" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function StarIcon({ filled, color }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path
        d="M18 3l3.9 8.1 8.9 1.3-6.4 6.3 1.5 8.8L18 23l-7.9 4.5 1.5-8.8-6.4-6.3 8.9-1.3z"
        fill={filled ? color : 'transparent'}
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── rating label text per language ───────────────────────────────────────────
const RATING_LABELS = {
  KO: { 1: '별로였어요 😔', 2: '조금 아쉬워요', 3: '괜찮았어요 😊', 4: '좋았어요!', 5: '최고예요! 🩷' },
  EN: { 1: 'Not great 😔', 2: 'Could be better', 3: 'It was okay 😊', 4: 'It was good!', 5: 'Loved it! 🩷' },
  ES: { 1: 'No fue bien 😔', 2: 'Podría mejorar', 3: 'Estuvo bien 😊', 4: '¡Fue buena!', 5: '¡Me encantó! 🩷' },
};
