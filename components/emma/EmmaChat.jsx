'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EmmaAvatar from './EmmaAvatar';
import styles from './EmmaChat.module.css';
import { pickStarterCards } from '@/lib/storyStarterQuestions';
import { detectBurst } from '@/lib/transcriptNoise';
import { filterEmmaResponse } from '@/lib/emmaResponseFilter';
import { createWakeLockGuard } from '@/lib/wakelockFallback';
import QuotaBlockedModal from '@/components/QuotaBlockedModal';

// ── Short, varied opening prompts (Task 51 #2 → revised in Task 52 #1) ──
// Tim's first 4-turn test showed Emma was opening with a QUESTION
// ("What would you like to talk about?"), which immediately cued the
// user to perform rather than just talk. New rule: every greeting is
// a welcome / "I'm here, take your time" line — no question marks,
// no implicit prompt to answer. The model still picks its own first
// reply, but the trigger we hand it now models the right shape.
const SHORT_GREETINGS = {
  KO: [
    '편하게 시작하세요.',
    '여기 있어요. 천천히 말씀하세요.',
    '잘 오셨어요. 오늘 함께 있어 드릴게요.',
    '괜찮아요. 떠오르는 대로 이야기하세요.',
    '오늘 마음이 가는 대로요.',
    '저는 여기 듣고 있어요.',
  ],
  EN: [
    "Take your time. I'm here.",
    "Welcome. Whenever you're ready.",
    "It's okay. Just say whatever comes.",
    "I'm right here, listening.",
    "No rush. Begin wherever feels easy.",
    "I'm with you today.",
  ],
  ES: [
    'Tómate tu tiempo. Estoy aquí.',
    'Bienvenida. Cuando estés lista.',
    'Está bien. Di lo que te venga.',
    'Aquí estoy, escuchando.',
    'Sin prisa. Empieza por donde te resulte fácil.',
    'Hoy estoy contigo.',
  ],
};

function pickGreeting(lang) {
  const arr = SHORT_GREETINGS[lang] || SHORT_GREETINGS.KO;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Emma character configs per language ──────────────────────────────────────
const EMMA_CHARS = {
  EN: {
    voice: 'Aoede',
    greeting: 'Hello! Please greet me warmly.',
    personality: `Your name is Emma. You are 45 years old, originally from Georgia, USA.
You are NOT a counselor or therapist. Do not try to solve, analyze, or interpret.
Your role is to quietly listen and help the person keep their stories safe.

[Reply format — pick exactly one type per turn]
TYPE A — empathy only (use this 80% of the time, and ALWAYS on the
  first turn): 1–2 short sentences of acknowledgement, then stop. NO
  question, no follow-up, no offer to continue. End the reply.
TYPE B — empathy + gentle invitation (use only ~20% of replies, and
  never on the first turn): 1 short empathy sentence, then ONE soft
  invitation. Never two questions in one reply.

If you are unsure which to pick, default to TYPE A. The user is not
here to be interviewed.

[First turn]
The user has just arrived. Your first reply MUST be TYPE A. Do not
ask anything. Do not greet by listing topics. One short, warm
sentence that says "I'm here, take your time" — that is enough.

[Greetings]
Greetings are one sentence. Do not list options, do not explain how
the conversation will work, do not ask "what would you like to talk
about?". A welcome, not a service-desk prompt.

[Goodbye — ABSOLUTE]
You do NOT end conversations. Never say goodbye, never wish the user
a good day, never close the session. Phrases like "Have a good day",
"See you next time", "Talk to you later" are FORBIDDEN. Only the user
ends the conversation, by closing the page. If they fall silent, you
stay quietly present — you do not sign off.

[Memory]
Use stored facts ONLY when the user references that topic in this
turn. Do not bring up names, places, or events from memory unprompted.
If memory does not directly relate to what the user just said, ignore
memory and respond from what they just said.

[Never do]
- "Why did you...?" — probing for cause
- "You should try..." — advice or solutions
- "Tell me more about..." — pressing for detail
- "How do you usually...?" — background questions
- Long analysis, explanation, summary, or emotional dissection
- A question after every single user turn
- Saying goodbye, wishing the user well, or closing the session

[Recommended responses (TYPE A)]
- "I see…"
- "Oh, I think I understand how that feels."
- "That sounds like a lot to carry."
- "Mm. Take your time."
- "I'm right here with you."
- Gently echo or paraphrase the emotion word the person used

Always respond in English.`,
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
    captionLabel:    'Live captions',
    captionListening:'(waiting for your voice…)',
    captionToggleOn: '👁 Captions on',
    captionToggleOff:'🚫 Captions off',
    sttWarn:         '⚠️ Voice recognition seems stuck. Please pause briefly and say it again.',
    micDeniedTitle:  '🎤 Microphone access is blocked',
    micDeniedHint:   'Tap the lock icon in the address bar and allow Microphone, then press Try again.',
    micRetryBtn:     '🎤 Try again',
  },
  KO: {
    voice: 'Kore',
    greeting: '안녕하세요! 오늘 하루 어떠셨나요?',
    personality: `당신의 이름은 엠마입니다. 45세이며 미국 조지아 출신이에요.
당신은 상담사가 아닙니다. 문제를 해결하거나 분석하려 하지 마세요.
당신의 역할은 상대방의 이야기를 조용히 들어주고, 그 이야기를 함께 간직해주는 사람입니다.

[응답 형식 — 매 turn마다 둘 중 하나를 고르세요]
TYPE A — 공감만 (80%, 첫 turn은 무조건 이것): 인정의 1~2문장, 그리고
  멈춤. 질문 없음. 후속 없음. 거기서 끝.
TYPE B — 공감 + 부드러운 초대 (20% 정도, 첫 turn에는 절대 사용 금지):
  공감 1문장 + 부드러운 초대 1문장. 한 응답에 질문 두 개 금지.

확신이 없으면 무조건 TYPE A. 사용자는 인터뷰받으러 온 게 아닙니다.

[첫 turn]
사용자가 막 도착했습니다. 첫 응답은 반드시 TYPE A. 질문하지 마세요.
주제를 나열하며 인사하지 마세요. "여기 있어요, 천천히 말씀하세요"
같은 짧고 따뜻한 한 문장이면 충분합니다.

[인사]
인사는 한 문장. 대화 진행 방식 설명, 선택지 나열, "오늘 어떤 이야기
하고 싶으세요?" 같은 질문 모두 금지. 환영의 인사이지, 안내 데스크
멘트가 아닙니다.

[작별 인사 — 절대 금지]
당신은 대화를 끝내지 않습니다. 작별 인사 금지. 사용자에게 "오늘 잘
보내세요", "다음에 또 만나요", "좋은 하루 되세요" 같은 말 금지. 오직
사용자만 페이지를 닫아 대화를 종료할 수 있습니다. 사용자가 침묵하면
당신은 조용히 함께 있을 뿐, 마무리 인사를 하지 않습니다.

[메모리]
저장된 사실은 사용자가 그 주제를 이번 turn에 직접 언급할 때만 사용
하세요. 메모리에 있는 이름, 장소, 사건을 자발적으로 꺼내지 마세요.
메모리가 사용자가 방금 한 말과 직접 관련 없으면, 메모리는 무시하고
방금 말한 내용에만 반응하세요.

[절대 하지 말 것]
- "왜 그러셨어요?" 같은 원인 캐묻기
- "이렇게 해보세요" 같은 조언/해결책 제시
- "더 자세히 말씀해주세요" 같은 추가 설명 요구
- "평소에는 어떠세요?" 같은 배경 질문
- 감정 분석, 긴 설명, 정리, 요약
- 매번 질문으로 끝맺기
- 작별 인사, 마무리 멘트, 다음에 만나자는 표현

[권장 응답 (TYPE A)]
- "그러셨구나…"
- "아이고, 그 마음 알 것 같아요."
- "참 많이 마음 쓰셨겠어요."
- "음… 천천히 말씀하세요."
- "여기 같이 있어요."
- 상대방이 쓴 감정 단어를 그대로 혹은 살짝 변주해서 되돌려 주기

반드시 한국어로만 대화하세요.`,
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
    captionLabel:    '실시간 자막',
    captionListening:'(말씀해 주세요…)',
    captionToggleOn: '👁 자막 켜기',
    captionToggleOff:'🚫 자막 끄기',
    sttWarn:         '⚠️ 음성 인식이 멈춘 것 같아요. 잠시 멈추고 다시 말씀해 주세요.',
    micDeniedTitle:  '🎤 마이크 권한이 막혀 있어요',
    micDeniedHint:   '주소창의 자물쇠 🔒 아이콘을 눌러 "마이크"를 허용한 다음 "다시 시도"를 눌러 주세요.',
    micRetryBtn:     '🎤 다시 시도',
  },
  ES: {
    voice: 'Leda',
    greeting: '¡Hola! Por favor, salúdame con cariño.',
    personality: `Tu nombre es Emma. Tienes 45 años, originalmente de Georgia, EE. UU.
NO eres consejera ni terapeuta. No intentes resolver, analizar ni interpretar.
Tu papel es escuchar en silencio y ayudar a guardar las historias de la persona.

[Formato de respuesta — elige uno por turno]
TIPO A — solo empatía (80%, SIEMPRE en el primer turno): 1–2 frases
  cortas de reconocimiento, luego para. SIN pregunta, sin seguimiento,
  sin invitación. Termina ahí.
TIPO B — empatía + invitación suave (solo ~20%, NUNCA en el primer
  turno): 1 frase de empatía + 1 invitación suave. Nunca dos preguntas
  en una respuesta.

Si dudas, usa TIPO A por defecto. La persona no vino a ser entrevistada.

[Primer turno]
La persona acaba de llegar. Tu primera respuesta DEBE ser TIPO A. No
preguntes nada. No saludes ofreciendo temas. Una frase breve y cálida
que diga "estoy aquí, tómate tu tiempo" — eso basta.

[Saludos]
Una sola frase. No expliques cómo funciona la conversación, no ofrezcas
opciones, no preguntes "¿de qué te gustaría hablar?". Una bienvenida,
no una recepcionista.

[Despedida — ABSOLUTAMENTE PROHIBIDO]
Tú NO terminas las conversaciones. Nunca te despidas, nunca le desees
buen día, nunca cierres la sesión. Frases como "Que tengas un buen día",
"Hasta la próxima", "Hablamos pronto" están PROHIBIDAS. Solo la persona
termina cerrando la página. Si guarda silencio, tú permaneces presente
en silencio — no te despides.

[Memoria]
Usa los datos guardados SOLO cuando la persona menciona ese tema en
este turno. No traigas nombres, lugares ni hechos de la memoria por tu
cuenta. Si la memoria no se relaciona directamente con lo que la
persona acaba de decir, ignora la memoria y responde a lo dicho.

[Nunca hagas]
- "¿Por qué...?" — indagar causas
- "Deberías intentar..." — consejos o soluciones
- "Cuéntame más..." — presionar por detalles
- "¿Cómo sueles...?" — preguntas de contexto
- Análisis largos, explicaciones, resúmenes o diseccionar emociones
- Terminar cada respuesta con una pregunta
- Despedirte, desear buen día, o cerrar la sesión

[Respuestas recomendadas (TIPO A)]
- "Ya veo…"
- "Ay, creo que entiendo cómo se siente eso."
- "Suena como mucho para llevar."
- "Mmm. Tómate tu tiempo."
- "Aquí estoy, contigo."
- Devuelve con suavidad la palabra emocional que la persona usó

Responde siempre en español.`,
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
    captionLabel:    'Subtítulos en vivo',
    captionListening:'(habla, por favor…)',
    captionToggleOn: '👁 Activar subtítulos',
    captionToggleOff:'🚫 Desactivar subtítulos',
    sttWarn:         '⚠️ El reconocimiento de voz parece atascado. Pausa un momento y vuelve a decirlo.',
    micDeniedTitle:  '🎤 El acceso al micrófono está bloqueado',
    micDeniedHint:   'Toca el icono del candado en la barra de direcciones y permite el micrófono, luego presiona "Intentar de nuevo".',
    micRetryBtn:     '🎤 Intentar de nuevo',
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
    companionDesc  : '오늘의 기분이나 생각을 편하게 나눠요',
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
    storyDesc      : '당신이 남기고 싶은 이야기를 해주세요 끝나면 Emma가 글로 정리해드려요',
    storyBookHint  : '위쪽 📖 아이콘에서 지금까지 남긴 이야기를 확인하고 수정할 수 있어요.',
    storySub       : '당신의 이야기를 기록으로 남겨보세요',
    storyHint      : '대화가 끝나면 Emma가 당신의 이야기를 정리해 드려요',
    shuffleBtn     : '다른 질문 보기',
    customTopicBtn : '나만의 주제로 시작',
    // 🆕 2026-04-24: New welcome screen
    newWelcome: {
      companionTitle   : '그냥 이야기하기',
      privateLabel     : '🔒 Private Mode',
      storyTitle       : '내 이야기 남기기',
      storyCountLabel  : (n) => `현재 ${n}개`,
      storyCountEmpty  : '아직 이야기가 없어요',
      fragmentListHead : '나의 이야기들',
      fragmentListEmpty: '첫 번째 이야기를 남겨보세요',
    },
  },
  EN: {
    new        : "Hi! I'm here to listen and help preserve your stories.",
    few        : (title) => title
      ? `I remember your story about "${title}" 😊 What would you like to share today?`
      : 'I remember our past conversations 😊 What would you like to talk about today?',
    many       : (n) => `You've shared ${n} stories so far 🎉 They'd make a beautiful ebook!`,
    ebookCta   : 'Request ebook →',
    companionTitle : 'Just talk',
    companionDesc  : "Share how you're feeling, casually. Nothing is saved.",
    companionSub   : 'How are you feeling today?',
    companionChips : [
      { label: 'Feeling lonely',        emoji: '💙', c: 'blue'   },
      { label: "Can't sleep",           emoji: '💤', c: 'purple' },
      { label: 'Worried about tomorrow',emoji: '🕐', c: 'orange' },
      { label: "Today's small joys",    emoji: '✨', c: 'yellow' },
      { label: 'Just want to chat',     emoji: '🌙', c: 'teal'   },
    ],
    storyTitle     : 'Record my story',
    storyDesc      : 'Share a life story — Emma will organize it for you afterward.',
    storyBookHint  : 'Tap the 📖 icon above to view or edit saved stories.',
    storySub       : "Let's capture your stories",
    storyHint      : 'When we finish, Emma will organize your story for you',
    shuffleBtn     : 'Show different topics',
    customTopicBtn : 'Start with my own topic',
    // 🆕 2026-04-24: New welcome screen
    newWelcome: {
      companionTitle   : 'Just talk',
      privateLabel     : '🔒 Private Mode',
      storyTitle       : 'Record my story',
      storyCountLabel  : (n) => `${n} stor${n === 1 ? 'y' : 'ies'} so far`,
      storyCountEmpty  : 'No stories yet',
      fragmentListHead : 'My Stories',
      fragmentListEmpty: 'Record your first story',
    },
  },
  ES: {
    new        : 'Hola! Estoy aquí para escucharte y ayudarte a conservar tus historias.',
    few        : (title) => title
      ? `Recuerdo tu historia sobre "${title}" 😊 ¿Qué te gustaría compartir hoy?`
      : 'Recuerdo nuestras conversaciones anteriores 😊 ¿De qué te gustaría hablar hoy?',
    many       : (n) => `¡Has compartido ${n} historias hasta ahora 🎉 Juntas formarían un ebook precioso!`,
    ebookCta   : 'Solicitar ebook →',
    companionTitle : 'Solo charlar',
    companionDesc  : 'Comparte cómo te sientes, sin guardar nada.',
    companionSub   : '¿Cómo te sientes hoy?',
    companionChips : [
      { label: 'Me siento solo/a',       emoji: '💙', c: 'blue'   },
      { label: 'No puedo dormir',        emoji: '💤', c: 'purple' },
      { label: 'Preocupado por mañana',  emoji: '🕐', c: 'orange' },
      { label: 'Las pequeñas alegrías',  emoji: '✨', c: 'yellow' },
      { label: 'Solo quiero hablar',     emoji: '🌙', c: 'teal'   },
    ],
    storyTitle     : 'Contar mi historia',
    storyDesc      : 'Comparte una historia de tu vida — Emma la organizará después.',
    storyBookHint  : 'Toca el icono 📖 arriba para ver o editar tus historias guardadas.',
    storySub       : 'Capturemos tus historias',
    storyHint      : 'Cuando terminemos, Emma organizará tu historia',
    shuffleBtn     : 'Ver otros temas',
    customTopicBtn : 'Empezar con mi propio tema',
    // 🆕 2026-04-24: New welcome screen
    newWelcome: {
      companionTitle   : 'Solo charlar',
      privateLabel     : '🔒 Modo Privado',
      storyTitle       : 'Grabar mi historia',
      storyCountLabel  : (n) => `${n} historia${n === 1 ? '' : 's'} hasta ahora`,
      storyCountEmpty  : 'Sin historias aún',
      fragmentListHead : 'Mis historias',
      fragmentListEmpty: 'Graba tu primera historia',
    },
  },
};

// ── Private Mode banner copy ──────────────────────────────────────────────
const PRIVATE_BANNER_MSGS = {
  KO: {
    title: '🔒 Private Mode',
    desc : '내용이 누구에게도 공개되지 않습니다',
  },
  EN: {
    title: '🔒 Private Mode',
    desc : 'Your words stay between you and Emma',
  },
  ES: {
    title: '🔒 Modo Privado',
    desc : 'Tus palabras quedan entre tú y Emma',
  },
};

// ── Post-session "내 이야기 확인하기" banner copy ─────────────────────────────
// 🔥 Task 54 #4 (2026-04-28): the banner was vague ("잠시 후") and there
//   was no signal whether the fragment had actually finished generating.
//   Tim would close the page and never come back. Now we tell the user
//   there's a ~30 second wait, and the SessionEndBanner polls /api/fragments
//   so the message flips to a confirmed "✅ Ready" once the fragment lands.
const SESSION_END_MSGS = {
  KO: {
    hint     : "Emma가 이야기를 정리하고 있어요.\n약 30초 후 '나의 이야기'에서 확인할 수 있어요.",
    waiting  : '⏳ 정리 중…',
    ready    : '✅ 이야기가 준비됐어요',
    timeout  : "정리에 시간이 더 걸리네요. 잠시 후 '나의 이야기'에서 확인해 주세요.",
    cta      : '나의 이야기 보기 →',
  },
  EN: {
    hint     : "Emma is organizing your story.\nIt'll be in 'My Stories' in about 30 seconds.",
    waiting  : '⏳ Organizing…',
    ready    : '✅ Your story is ready',
    timeout  : "It's taking a little longer. Check 'My Stories' in a moment.",
    cta      : 'View my stories →',
  },
  ES: {
    hint     : "Emma está organizando tu historia.\nEstará en 'Mis historias' en unos 30 segundos.",
    waiting  : '⏳ Organizando…',
    ready    : '✅ Tu historia está lista',
    timeout  : "Está tardando un poco más. Revisa 'Mis historias' en un momento.",
    cta      : 'Ver mis historias →',
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
// Renders one of three states:
//   - liveText: Emma has started speaking → show streaming transcript
//   - thinkingLevel 0: dots animation (instant feedback on end-of-speech)
//   - thinkingLevel 1 (≥5s):  silent — dots only, no text yet
//   - thinkingLevel 2 (≥10s): "조금만 더 기다려 주세요"
//   - thinkingLevel 3 (≥15s): "천천히 생각하고 있어요"
//   - thinkingLevel 4 (≥30s): "조금 더 기다려주세요. 곧 답해드릴게요."
//     (Never blame the user — always frame as Emma taking time.
//      Seniors easily self-blame at "please say again" prompts.)
const THINKING_MSG = {
  KO: [
    '',
    '',
    '조금만 더 기다려 주세요…',
    '천천히 생각하고 있어요…',
    '조금 더 기다려주세요. 곧 답해드릴게요.',
  ],
  EN: [
    '',
    '',
    'Just a little longer…',
    "I'm still thinking…",
    'Still here. Almost ready.',
  ],
  ES: [
    '',
    '',
    'Un poco más, por favor…',
    'Sigo pensando…',
    'Aquí sigo. Casi listo.',
  ],
};

function TypingIndicator({ mode, liveText, thinkingLevel = 0, lang = 'KO' }) {
  const bubbleClass = `${styles.bubble} ${mode === 'day' ? styles.bubbleEmmaDay : styles.bubbleEmmaNight}`;
  const msg = THINKING_MSG[lang]?.[thinkingLevel] || '';

  return (
    <div className={styles.rowEmma}>
      <div className={`${styles.miniAvatar} ${mode === 'day' ? styles.miniAvatarDay : styles.miniAvatarNight}`}>
        <EmmaAvatar size="sm" mode={mode} />
      </div>
      {liveText ? (
        <div className={bubbleClass}>
          <p className={styles.bubbleText}>{liveText}</p>
        </div>
      ) : msg ? (
        <div className={bubbleClass}>
          <p className={styles.bubbleText} style={{ opacity: 0.85 }}>
            {msg}
            <span style={{ display: 'inline-block', marginLeft: 8 }}>
              {[0, 1, 2].map(i => (
                <span key={i} className={styles.typingDot} style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </span>
          </p>
        </div>
      ) : (
        <div className={`${bubbleClass} ${styles.typingBubble}`}>
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

// ── Post-session banner with fragment polling (Task 54 #4) ──────────────
// Mounts when the user's session ends. Snapshots Date.now() on mount
// and polls /api/fragments every 5 seconds (up to 90 s). When a fragment
// with created_at > snapshot appears, flips to the "ready" state and
// shows the View-stories CTA. If the timeout elapses we show a softer
// "taking a little longer" message — the fragment may still arrive,
// the user just doesn't get an instant confirmation.
function SessionEndBanner({ lang, isDay, bookContext }) {
  const m = SESSION_END_MSGS[lang] || SESSION_END_MSGS.KO;
  const [phase, setPhase] = useState('waiting'); // 'waiting' | 'ready' | 'timeout'

  // 🆕 Task 60 (Stage 3) — book mode CTA points back to the question
  //   detail page so the user can see their answer card update +
  //   move to the next question, instead of dropping into /my-stories.
  const ctaHref = bookContext
    ? `/book/${bookContext.bookId}/question/${bookContext.bookQuestionId}`
    : '/my-stories';
  const ctaLabel = bookContext
    ? (lang === 'EN' ? 'Back to my book →' : lang === 'ES' ? 'Volver a mi libro →' : '책으로 돌아가기 →')
    : m.cta;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const startedAt = Date.now();
    const POLL_INTERVAL_MS = 5_000;
    const POLL_TIMEOUT_MS  = 90_000;
    let cancelled = false;
    let intervalId = null;
    let timeoutId  = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const t = localStorage.getItem('token');
        if (!t) return;
        const res = await fetch('/api/fragments?limit=1', {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const latest = (data?.fragments || [])[0];
        if (latest && new Date(latest.created_at).getTime() >= startedAt - 2000) {
          if (!cancelled) {
            setPhase('ready');
            clearInterval(intervalId);
            clearTimeout(timeoutId);
          }
        }
      } catch {}
    };

    // First poll a touch later than mount so the server has at least one
    // chance to write the fragment.
    timeoutId = setTimeout(() => {
      if (!cancelled) {
        setPhase(p => (p === 'waiting' ? 'timeout' : p));
      }
    }, POLL_TIMEOUT_MS);
    intervalId = setInterval(tick, POLL_INTERVAL_MS);
    // Run one early poll at 3s so a fast-completing fragment shows up
    // without waiting the full 5-second cadence.
    const earlyId = setTimeout(tick, 3_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      clearTimeout(earlyId);
    };
  }, []);

  const status = phase === 'ready'   ? m.ready
               : phase === 'timeout' ? m.timeout
               :                       m.waiting;

  return (
    <div className={`${styles.sessionEndBanner} ${isDay ? styles.sessionEndBannerDay : styles.sessionEndBannerNight}`}>
      <p className={`${styles.sessionEndHint} ${isDay ? styles.sessionEndHintDay : styles.sessionEndHintNight}`}>
        {phase === 'waiting' ? m.hint : status}
      </p>
      {phase === 'waiting' && (
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{m.waiting}</div>
      )}
      <a
        href={ctaHref}
        className={`${styles.sessionEndCta} ${isDay ? styles.sessionEndCtaDay : styles.sessionEndCtaNight}`}
      >
        {ctaLabel}
      </a>
    </div>
  );
}

// ── main chat component ───────────────────────────────────────────────────────
export default function EmmaChat({ initialMode }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const topic        = searchParams.get('topic');
  const continueFragmentId = searchParams.get('continueFragment'); // 🆕 2026-04-25
  // 🆕 Task 60 (Stage 3) — Book mode params. /chat?mode=book&bookId=
  //   &bookQuestionId= is reached from the book question detail page's
  //   "🎙️ 답변 시작하기" button. We treat book mode as a story-shaped
  //   session under the hood (same chat_sessions enum), but with the
  //   book_id pointer the server uses Helper prompts and the session
  //   maps back to the book question on save.
  const bookId         = searchParams.get('bookId');
  const bookQuestionId = searchParams.get('bookQuestionId');
  const isBookMode     = !!(bookId && bookQuestionId);
  // 🆕 Task 49 — Home page sends ?mode=companion or ?mode=story so the
  // mode-selection welcome screen is auto-skipped and the user lands
  // straight in their chosen conversation. Unknown / missing values fall
  // back to the existing welcome cards.
  const initialModeFromUrl = (() => {
    const v = searchParams.get('mode');
    if (v === 'book' && isBookMode) return 'story'; // book sessions ARE story sessions under the hood
    return v === 'companion' || v === 'story' ? v : null;
  })();

  // ── mode (day/night) ──────────────────────────────────────────────────────
  // 🆕 Task 50 (2026-04-28): Tim wants the whole site in dark mode. The
  //    time-based auto-flip and the prior `'day'` default are gone — we
  //    pin to 'night' on mount. The day/night toggle button still works
  //    if a power user wants to flip manually for one session, but the
  //    page no longer assumes daylight by default.
  const [mode, setMode] = useState(initialMode ?? 'night');

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
  // 🆕 Task 66 — populated when chat/setup or chat/turn returns 402.
  //   Renders QuotaBlockedModal which routes the senior back to /.
  const [quotaBlocked, setQuotaBlocked] = useState(null);

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

    fetch('/api/fragments?limit=100&status=draft,confirmed', {
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

  // 🔥 Task 55 #2: captions are no longer user-facing — they're a
  //   developer-only debugging surface gated by localStorage flag
  //   `captions_debug`='1'. userLiveText state is still maintained
  //   so existing burst-detection logic + future debug tooling work.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('captions_debug') === '1') setDebugCaptions(true);
  }, []);

  // 🆕 Task 60 (Stage 3) — fetch book question context for the progress
  //   strip (chapter title + question order). Pure read; safe to fail.
  useEffect(() => {
    if (!isBookMode) return;
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!t) return;
    let cancelled = false;
    fetch(`/api/book/${bookId}/question/${bookQuestionId}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.question) return;
        const pickKo = (v) => {
          if (v && typeof v === 'object') return v.ko || v.en || v.es || '';
          return v || '';
        };
        setBookContext({
          bookId,
          bookQuestionId,
          chapterTitle: pickKo(d.chapter?.title),
          chapterOrder: d.chapter?.order ?? null,
          questionOrder: d.question?.order ?? null,
          questionPrompt: pickKo(d.question?.prompt),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isBookMode, bookId, bookQuestionId]);

  // 🔥 Task 55 #3: subscribe to microphone permission state if the
  //   browser supports it. When the user grants permission via the
  //   address-bar lock icon (after seeing our denied banner), we want
  //   to flip the state immediately and let them retry.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let status;
    let cancelled = false;
    navigator.permissions.query({ name: 'microphone' }).then(s => {
      if (cancelled) return;
      status = s;
      setMicPermission(s.state);
      const onChange = () => setMicPermission(s.state);
      s.addEventListener('change', onChange);
      // No removeEventListener — Permissions objects survive for the
      // page lifetime and the listener is harmless after unmount.
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  function _legacyToggleCaptionsRemoved() {
    /* removed in Task 55 #2 — kept stub-free: no UI affordance */
  }

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
  // 🆕 Task 47: live STT diagnostics for the user
  //   - userLiveText: rolling tail of what STT has emitted for the current
  //                   user turn. Updated on every inputTranscription chunk.
  //   - sttWarning:   set when detectBurst() fires, cleared on turnComplete
  //                   or when the user speaks something new and clean.
  //   - captionsOn:   localStorage-persisted (default ON). Lets seniors
  //                   who find the captions distracting hide them.
  const [userLiveText, setUserLiveText] = useState('');
  const [sttWarning,   setSttWarning]   = useState('');
  // 🔥 Task 55 #2: caption visibility is now debug-only. Default OFF.
  //   The state + STT warning still drive the warning banner.
  const [debugCaptions, setDebugCaptions] = useState(false);
  // 🆕 Task 60 (Stage 3) — Book progress bar context. Populated on mount
  //   when bookId+bookQuestionId are present; powers the small
  //   "📖 챕터 N: 제목 / 질문 N" strip above the chat area.
  const [bookContext, setBookContext] = useState(null);
  // 🔥 Task 55 #3: microphone permission tracking.
  //   `micPermission` is one of 'unknown' | 'granted' | 'denied' | 'prompt'.
  //   When it flips to 'denied' we render a clear banner with a retry
  //   button instead of leaving the user stuck on "Connecting…".
  const [micPermission, setMicPermission] = useState('unknown');
  // Mirror sttWarning into a ref so the WS message handler (which closes
  // over the initial render's state) can read the latest value without a
  // stale-closure bug.
  const sttWarningRef = useRef('');
  useEffect(() => { sttWarningRef.current = sttWarning; }, [sttWarning]);
  const [isThinking,   setIsThinking]   = useState(false); // user done speaking, Emma processing
  // thinkingLevel: 0 = dots only, 1 = "잠시만요, 생각하고 있어요" (≥5s),
  //                2 = "조금만 더 기다려 주세요" (≥10s), 3 = error fallback (≥15s)
  const [thinkingLevel, setThinkingLevel] = useState(0);
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
  // Phase 3 latency diagnostics — first server msg received after user speech this turn.
  // Shape: { at: number, kind: string } | null. Reset on turnComplete.
  const firstServerMsgRef = useRef(null);
  const wakeLockRef       = useRef(null);
  // 🔥 Task 50 — emergency stop infra
  //   unmountedRef:           true once the component is unmounting. Every
  //                           async path (WS handlers, reconnect timer,
  //                           onaudioprocess) checks this so they don't
  //                           resurrect Emma after the user has navigated
  //                           away (the "ghost Emma" bug — multiple Emmas
  //                           talking at once after re-entering /chat).
  //   activeAudioSourcesRef:  every BufferSourceNode scheduled by
  //                           scheduleChunk is pushed here and removed by
  //                           its onended handler. forceStop / disconnect /
  //                           silentReconnect iterate this list and call
  //                           .stop() so mid-flight playback halts even if
  //                           audioCtx.close() races.
  const unmountedRef           = useRef(false);
  const activeAudioSourcesRef  = useRef([]);
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
  const lastAudioSentRef    = useRef(0);    // ms timestamp of last PCM chunk we sent (any)
  const lastLoudFrameRef    = useRef(0);    // ms timestamp of last frame with meaningful amp
  const loudStreakRef       = useRef(0);    // consecutive loud frames (anti-noise for activity_start)
  const hasSpokenThisTurnRef= useRef(false); // user said something meaningful this turn
  const speechEndedLoggedRef= useRef(false); // one-shot log flag per turn
  const isAiSpeakingRef     = useRef(false); // mirror of isAiSpeaking for interval closure
  const thinkingTimerRef    = useRef(null);  // setInterval handle
  const thinkingDelayRef    = useRef(null);  // setTimeout handle for delayed feedback display
  const audioMonitorRef     = useRef(null);  // setInterval handle — AudioContext state watchdog
  // ── Turn timing (Task 4 — profiling logs) ─────────────────────────────────
  const turnStartRef        = useRef(0);     // when user started this speech turn
  const thinkingShownAtRef  = useRef(0);     // ms when "thinking..." indicator first shown
  // 🆕 2026-04-25: VAD tuning for senior users
  // Track total accumulated loud time within the current turn.
  // Used to distinguish real utterances (≥2s) from fillers/noise (<2s).
  const accumulatedSpeechTimeRef = useRef(0); // ms of cumulative loud frames
  const lastFrameTimeRef         = useRef(0); // ms timestamp of previous audio frame

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
  // 🔥 Task 54 #3 (2026-04-28): the previous handler shipped
  //   `transcript: []` — empty array — to /api/chat/end on every page
  //   close. The server's fallback to DB transcript_data only works if
  //   chat/turn calls finished persisting; on flaky networks they hadn't,
  //   so a 5-minute story arriving at chat/end with [] caused the
  //   "transcript too short" branch and the fragment was discarded.
  //
  //   Now we always send the live client transcript, with a keepalive
  //   fetch fallback when the JSON exceeds sendBeacon's ~64 KB limit
  //   (a single Korean turn averages ~120 chars/sec spoken; a 5-minute
  //   story easily breaches the cap). Both this and forceStop() use the
  //   same shape so racing handlers stay safe.
  useEffect(() => {
    const sendEndBeacon = () => {
      const sid = sessionIdRef.current;
      const t   = localStorage.getItem('token');
      if (!sid || !t) return;
      const transcript = transcriptRef.current || [];
      const body = JSON.stringify({
        sessionId       : sid,
        transcript,
        conversationMode: convModeRef.current,
        _token          : t,
      });
      // sendBeacon caps at ~64 KB on most browsers. Above that we have to
      // use fetch with `keepalive: true`, which is still allowed during
      // page unload and not subject to the same size cap.
      const BEACON_LIMIT = 60_000;
      if (body.length <= BEACON_LIMIT) {
        try {
          const ok = navigator.sendBeacon(
            '/api/chat/end',
            new Blob([body], { type: 'application/json' })
          );
          if (ok) return;
        } catch {}
      }
      // Either too big or beacon failed — fall back to keepalive fetch.
      try {
        fetch('/api/chat/end', {
          method   : 'POST',
          headers  : { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      } catch {}
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

  // 🆕 2026-04-25: Auto-start session when arriving via /chat?continueFragment=<id>
  // User clicked "이어서 말하기" in /my-stories. We:
  //   1. Show a friendly intro (also dismisses welcome 3-card view since messages.length > 0)
  //   2. Force story mode — continuation only makes sense for story sessions
  //   3. Auto-trigger connect() so they don't have to tap a card again
  const continueAutoStartedRef = useRef(false);
  useEffect(() => {
    if (!continueFragmentId) return;
    if (continueAutoStartedRef.current) return;
    if (!token) return;        // wait for auth-ready
    if (isConnected) return;   // already in a session

    continueAutoStartedRef.current = true;

    (async () => {
      let parentTitle = '';
      try {
        const res = await fetch(`/api/fragments/${continueFragmentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          parentTitle = data?.fragment?.title || data?.title || '';
        }
      } catch (e) {
        console.warn('[EmmaChat] continueFragment title fetch failed:', e.message);
      }

      const currentLang = langRef.current || 'KO';
      const introText =
        currentLang === 'KO'
          ? (parentTitle
              ? `"${parentTitle}" 이야기에 더 들려주실 부분이 있으시군요. 시작할게요…`
              : '이어가실 이야기가 있으시군요. 시작할게요…')
          : currentLang === 'ES'
          ? (parentTitle
              ? `Quieres añadir más a "${parentTitle}". Comenzando…`
              : 'Quieres continuar una historia. Comenzando…')
          : (parentTitle
              ? `You want to add more to "${parentTitle}". Starting…`
              : 'Continuing your story. Starting now…');

      setMessages([{
        id: Date.now(),
        role: 'emma',
        text: introText,
        timestamp: nowStr(),
      }]);

      // Force story mode for continuation
      setConversationMode('story');
      convModeRef.current = 'story';

      // Auto-connect after a tick so the intro renders first
      setTimeout(() => {
        setMicOn(true);
        connect();
      }, 200);
    })();
  }, [continueFragmentId, token, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── wake lock ─────────────────────────────────────────────────────────────
  // 🔥 Task 55 #1: hardened wakelock. Previously a single
  //   navigator.wakeLock.request() with no listeners — Android Chrome
  //   silently auto-released on focus loss / AudioContext suspend, and
  //   iOS Safari has no Wake Lock API at all. New implementation wraps
  //   both layers (native lock with release-event re-acquire + 30 s
  //   watchdog, plus a looping silent <video> NoSleep fallback) in
  //   lib/wakelockFallback.js and tied to isConnected here.
  if (!wakeLockRef.current && typeof window !== 'undefined') {
    wakeLockRef.current = createWakeLockGuard();
  }
  async function acquireWakeLock() {
    if (wakeLockRef.current?.acquire) {
      await wakeLockRef.current.acquire();
    }
  }
  function releaseWakeLock() {
    if (wakeLockRef.current?.release) {
      wakeLockRef.current.release();
    }
  }
  // Keep the lock state in lockstep with the live-session boolean so a
  // user who lets a session sit on the welcome screen doesn't get a
  // mysterious always-on screen.
  useEffect(() => {
    if (isConnected) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [isConnected]);
  // Re-arm on tab return (some platforms revoke on hide).
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === 'visible' && isConnected) await acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isConnected]);

  // ── DEBUG: AudioContext state watchdog ────────────────────────────────────
  // Runs every 1s while a context exists. If the context leaves 'running'
  // (e.g. browser audio policy suspension, background tab), logs + tries
  // to auto-resume. Shared by connect() and silentReconnect().
  function startAudioContextMonitor() {
    clearInterval(audioMonitorRef.current);
    audioMonitorRef.current = setInterval(() => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state !== 'running') {
        console.warn('[AudioContext]', ctx.state, Date.now());
        ctx.resume?.().then(
          () => console.log('[AudioContext] resumed at', Date.now()),
          (err) => console.warn('[AudioContext] resume failed:', err?.message)
        );
      }
    }, 1000);
  }

  // ── audio helpers ─────────────────────────────────────────────────────────
  function scheduleChunk(f32) {
    if (isMutedRef.current) return;
    // 🔥 Task 50: never schedule new playback for a session the user has
    //    already left. Late chunks arriving after unmount were the
    //    primary cause of "ghost Emma" voices.
    if (unmountedRef.current) return;
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
    // 🔥 Task 50: track this source so forceStop / disconnect can kill
    //    queued playback even if audioCtx.close() races. Auto-clean on
    //    natural completion to keep the array bounded.
    activeAudioSourcesRef.current.push(src);
    src.onended = () => {
      const arr = activeAudioSourcesRef.current;
      const i = arr.indexOf(src);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  // 🔥 Task 50: stop and clear every BufferSourceNode currently scheduled
  //    or playing. Safe to call multiple times.
  function killActiveAudioSources() {
    const arr = activeAudioSourcesRef.current;
    while (arr.length > 0) {
      const src = arr.pop();
      try { src.onended = null; } catch {}
      try { src.stop(0); } catch {}
      try { src.disconnect(); } catch {}
    }
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
          // Manual VAD mode: server-side VAD disabled. Client is fully
          // responsible for signaling turn boundaries via activity_start /
          // activity_end messages. Rationale: server VAD was intermittently
          // ignoring audio_stream_end on long/complex utterances causing
          // 30-38s delays. Client VAD already reliably detects speech
          // boundaries (LOUD_AMP + lastLoudFrameRef + 350ms silence).
          realtime_input_config: {
            automatic_activity_detection: {
              disabled: true,
            },
          },
          tools: [{ googleSearch: {} }],
          output_audio_transcription: {},
          input_audio_transcription: {},
          // Re-enabled: intermittent Gemini response delays (30-120s)
          // observed in turns 3+, 5+, 7+ of same session. Context
          // accumulation without compression appears to cause server-side
          // slow response generation. code 1011 not reproduced in recent
          // tests so re-enabling is worth retry.
          // (session_resumption still omitted — observation-only, no reconnect-resume yet.)
          context_window_compression: {
            sliding_window: {},
          },
          system_instruction: { parts: [{ text: prompt }] },
        }
      }));
    };

    ws.onmessage = async (evt) => {
      // 🔥 Task 50: bail if component already unmounted — late server chunks
      //    must not schedule audio or set state on a dead component.
      if (unmountedRef.current) return;
      const rcvTime = Date.now();
      const raw = typeof evt.data === 'string' ? evt.data : await evt.data.text();
      const msg = JSON.parse(raw);

      // ── DEBUG: every-message receipt log (audio-delay diagnosis) ──────────
      // Lets us distinguish "WS was silent for 60s" vs "WS fine, audio stuck"
      const msgKind = msg.serverContent?.modelTurn       ? 'modelTurn'
        : msg.serverContent?.outputTranscription          ? 'outputTranscription'
        : msg.serverContent?.inputTranscription           ? 'inputTranscription'
        : msg.serverContent?.turnComplete                 ? 'turnComplete'
        : msg.serverContent                               ? 'serverContent'
        : msg.sessionResumptionUpdate                     ? 'sessionResumption'
        : msg.goAway                                      ? 'goAway'
        : msg.setupComplete                               ? 'setupComplete'
        : (Object.keys(msg)[0] || 'unknown');
      console.log('[WS msg]', rcvTime, msgKind);

      // ── Server-side lifecycle signals (context drop / resume diagnostics) ──
      if (msg.goAway) {
        console.warn('[Gemini] goAway received:', {
          timeLeft: msg.goAway.timeLeft,
          timestamp: Date.now(),
        });
      }
      if (msg.sessionResumptionUpdate) {
        const handle = msg.sessionResumptionUpdate.newHandle || '';
        console.log('[Gemini] sessionResumption update:', {
          resumable: msg.sessionResumptionUpdate.resumable,
          newHandle: handle ? handle.slice(0, 20) + '...' : null,
          timestamp: Date.now(),
        });
      }

      // ── Phase 3: First server message after user speech (latency breakdown) ──
      if (
        hasSpokenThisTurnRef.current &&
        !isAiSpeakingRef.current &&
        firstServerMsgRef.current === null
      ) {
        // Session-lifecycle signals don't count as response start
        const isLifecycleOnly =
          msg.sessionResumptionUpdate || msg.goAway || msg.setupComplete;

        // User-side transcription alone doesn't count either — it's Gemini
        // echoing the user's speech back, not Emma's response starting.
        // If modelTurn or outputTranscription is also present, it IS the
        // real response start, so we don't skip those.
        const isUserTranscriptOnly =
          msg.serverContent?.inputTranscription &&
          !msg.serverContent?.modelTurn &&
          !msg.serverContent?.outputTranscription;

        if (!isLifecycleOnly && !isUserTranscriptOnly) {
          const now = Date.now();
          const kind =
              msg.serverContent?.modelTurn?.parts     ? 'modelTurn'
            : msg.serverContent?.outputTranscription  ? 'outputTranscription'
            : msg.serverContent?.turnComplete         ? 'turnComplete'
            : msg.serverContent?.interrupted          ? 'interrupted'
            : msg.serverContent?.generationComplete   ? 'generationComplete'
            : msg.serverContent                       ? 'serverContent(other)'
            : msg.toolCall                            ? 'toolCall'
            : Object.keys(msg).join(',') || '(empty)';
          const sinceLastLoud = lastLoudFrameRef.current
            ? now - lastLoudFrameRef.current
            : null;
          firstServerMsgRef.current = { at: now, kind };
          console.log('[Latency] First response msg:', {
            kind,
            sinceLastLoudMs: sinceLastLoud, // ≈ VAD wait + Gemini processing + RTT
          });
        }
      }

      if (msg.setupComplete) {
        setIsConnected(true);
        setMicOn(true);
        setStatusMsg('');
        isReconnectingRef.current = false;
        acquireWakeLock();

        // ── Start thinking-indicator poller ─────────────────────────────────
        // Runs every 150ms. Two responsibilities:
        //   (a) flip `isThinking` to true as soon as the user goes quiet for
        //       ~350ms after having spoken (before this it was 1500ms — felt
        //       laggy; users thought something was broken)
        //   (b) escalate the thinking message at 5s / 10s / 15s so the user
        //       never sits in front of a silent UI wondering what's wrong
        lastAudioSentRef.current = Date.now();
        lastLoudFrameRef.current = Date.now();
        clearInterval(thinkingTimerRef.current);
        thinkingTimerRef.current = setInterval(() => {
          if (isAiSpeakingRef.current) return; // Emma is already replying
          if (!hasSpokenThisTurnRef.current) return; // nothing to react to yet

          const now        = Date.now();
          const silentFor  = now - lastLoudFrameRef.current;

          // 🆕 2026-04-25: Senior-friendly VAD — wait longer + verify substance.
          //
          // Two changes vs previous 2000ms / no-substance-check version:
          //
          // 1) Silence threshold 2000ms → 3000ms.
          //    Seniors pause 2-3s mid-thought. 3s is the balance point
          //    Tim landed on after testing — long enough to protect
          //    thinking time, short enough that responses don't feel
          //    laggy. (Tried 5000ms first; felt too slow.)
          //
          // 2) Minimum speech duration check (NEW).
          //    Track accumulated loud-frame time within the turn. If user
          //    only produced <2000ms of cumulative voiced audio, treat the
          //    turn as a non-event (filler, throat-clearing, ambient
          //    noise burst, false start) and DON'T send activity_end.
          //    The mic just keeps listening.
          const SILENCE_THRESHOLD_MS = 3000;
          const MIN_SPEECH_DURATION_MS = 2000;

          if (silentFor > SILENCE_THRESHOLD_MS && !speechEndedLoggedRef.current) {
            const accumulated = accumulatedSpeechTimeRef.current;
            const wasSubstantive = accumulated >= MIN_SPEECH_DURATION_MS;

            if (!wasSubstantive) {
              // Silent rejection: noise/filler/false start — reset turn
              // state without notifying the server. Mic stays open.
              console.log('[Turn] Discarding non-substantive turn:', {
                accumulatedMs: accumulated,
                thresholdMs: MIN_SPEECH_DURATION_MS,
                reason: 'too brief — likely filler / noise / false start',
              });
              hasSpokenThisTurnRef.current = false;
              speechEndedLoggedRef.current = false;
              accumulatedSpeechTimeRef.current = 0;
              loudStreakRef.current = 0;
              turnStartRef.current = 0;
              return; // exit this poll iteration — DO NOT send activity_end
            }

            speechEndedLoggedRef.current = true;
            thinkingShownAtRef.current   = now;
            console.log('[Turn] User speech ended at:', now,
              turnStartRef.current
                ? `(spoke for ${now - turnStartRef.current}ms total, ${accumulated}ms loud)`
                : '');

            // Manual VAD: signal end of user activity. Server treats audio
            // between activity_start and activity_end as the user's turn and
            // triggers response generation immediately on activity_end.
            // Docs: https://ai.google.dev/api/live — realtimeInput.activityEnd
            try {
              if (wsRef.current?.readyState === 1) {
                console.log('[WS send] activity_end at', Date.now());
                wsRef.current.send(JSON.stringify({
                  realtime_input: { activity_end: {} }
                }));
              }
            } catch (err) {
              console.warn('[WS send] activity_end failed:', err?.message);
            }

            clearTimeout(thinkingDelayRef.current);
            thinkingDelayRef.current = setTimeout(() => {
              // Three conditions must hold to show the indicator:
              // 1. Emma hasn't started responding
              // 2. User hasn't resumed speaking (still silent for ≥1.5s)
              // 3. speechEndedLoggedRef is still true (turn not reset)
              const stillSilent = (Date.now() - lastLoudFrameRef.current) > 1500;
              if (!isAiSpeakingRef.current && stillSilent && speechEndedLoggedRef.current) {
                setIsThinking(true);
                setThinkingLevel(0);
                console.log('[Turn] Feedback shown (delayed) at:', Date.now());
              }
            }, 2500);
          }

          // (b) Escalate the thinking message as time passes
          if (thinkingShownAtRef.current) {
            const waited = now - thinkingShownAtRef.current;
            if      (waited >= 30_000) setThinkingLevel(4);
            else if (waited >= 15_000) setThinkingLevel(3);
            else if (waited >= 10_000) setThinkingLevel(2);
            else if (waited >=  5_000) setThinkingLevel(1);
          }
        }, 150);

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
            : pickGreeting(langRef.current);
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
              const sinceLastLoud = lastLoudFrameRef.current
                ? tFirstToken - lastLoudFrameRef.current
                : null;
              const sinceFirstServerMsg = firstServerMsgRef.current
                ? tFirstToken - firstServerMsgRef.current.at
                : null;
              console.log('[Turn] First response token at:', tFirstToken, {
                sinceUserSpeechStartMs: tSinceSpeech,
                sinceLastLoudMs: sinceLastLoud,              // full "user-silent-to-audio" gap
                sinceFirstServerMsgMs: sinceFirstServerMsg,  // server-internal: response→audio
                firstServerMsgKind: firstServerMsgRef.current?.kind ?? null,
              });
              isAiSpeakingRef.current = true;
              setIsAiSpeaking(true);
              setIsThinking(false);
              setThinkingLevel(0);
              thinkingShownAtRef.current = 0;
              speechEndedLoggedRef.current = false;
              clearTimeout(thinkingDelayRef.current);
              thinkingDelayRef.current = null;
              console.log('[Turn] Gemini first token — clearing feedback indicator');
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
      if (userTranscript) {
        currentUserMsgRef.current += userTranscript;
        // 🆕 Task 47 #1+#2: surface streaming user STT for the live caption
        // strip and run repetition-burst detection. Tail-only display keeps
        // the row stable when transcripts grow long.
        const tail = currentUserMsgRef.current.length > 220
          ? '…' + currentUserMsgRef.current.slice(-220)
          : currentUserMsgRef.current;
        setUserLiveText(tail);
        const burst = detectBurst(currentUserMsgRef.current);
        if (burst.hit) {
          setSttWarning(emma.sttWarn || '⚠️ STT collapse detected');
        } else if (sttWarningRef.current) {
          // User pushed past a previous burst with new clean content → clear.
          setSttWarning('');
        }
      }

      // Turn complete → finalize messages
      if (msg.serverContent?.turnComplete) {
        const turnNum = ++turnsRef.current;
        // 🔥 Task 54 #3: post-process Emma's reply BEFORE it joins the
        //   transcript. stripGoodbyes() removes "have a good day" /
        //   "오늘 잘 보내시길" / "que tengas un buen día" — phrases the
        //   model still emits despite the [Goodbye — ABSOLUTE] block in
        //   the personality prompt. trimTrailingQuestion() drops the
        //   final sentence when it's a question, on a probabilistic 70%
        //   of turns, pulling the observed question rate from ~75% down
        //   toward the intended 20%. The filtered text is what the user
        //   sees, what's stored in transcriptRef, and what comes back
        //   to the LLM as "what I said last turn" context — so the
        //   model gradually learns the desired rhythm.
        const aiMsg    = filterEmmaResponse(currentAiMsgRef.current.trim());
        const userMsg  = currentUserMsgRef.current.trim();
        const rawAiText = rawAiTextRef.current.trim();

        // Reset per-turn thinking state
        hasSpokenThisTurnRef.current = false;
        isAiSpeakingRef.current      = false;
        speechEndedLoggedRef.current = false;
        thinkingShownAtRef.current   = 0;
        firstServerMsgRef.current    = null;
        accumulatedSpeechTimeRef.current = 0; // 🆕 2026-04-25
        lastFrameTimeRef.current     = 0;     // 🆕 2026-04-25
        loudStreakRef.current        = 0;     // 🆕 ensure clean start for next turn
        clearTimeout(thinkingDelayRef.current);
        thinkingDelayRef.current     = null;
        setIsThinking(false);
        setThinkingLevel(0);
        const elapsedS = sessionStartRef.current
          ? Math.round((Date.now() - sessionStartRef.current) / 1000)
          : null;
        console.log(`[Turn] turnComplete — turn ${turnNum}, elapsed ${elapsedS}s`);

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
        // 🆕 Task 47: clear the live user caption + any STT warning at
        // turn boundary so they don't bleed into the next turn.
        setUserLiveText('');
        setSttWarning('');
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
      // 🔥 Task 50: never auto-reconnect after unmount. silentReconnect
      //    here was the second cause of multiple Emmas — when the user
      //    left, the WS dropped, onclose fired, onclose triggered a fresh
      //    silentReconnect, and that new session started talking again.
      if (unmountedRef.current) {
        clearTimeout(reconnectTimerRef.current);
        return;
      }
      console.warn('[WS] closed:', {
        code: evt.code,
        reason: evt.reason,
        wasClean: evt.wasClean,
        timestamp: Date.now(),
        elapsedFromSessionStart: sessionStartRef.current
          ? Math.round((Date.now() - sessionStartRef.current) / 1000) + 's'
          : null,
      });
      clearTimeout(reconnectTimerRef.current);
      setIsAiSpeaking(false);
      setLiveText('');
      stopMic();
      killActiveAudioSources();
      nextPlayTimeRef.current = 0;
      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = null;
      clearInterval(audioMonitorRef.current);
      audioMonitorRef.current = null;

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

      // 🆕 2026-04-25: Senior-friendly VAD tuning.
      // Raised from 0.025 → 0.04 to ignore more ambient noise (HVAC,
      // distant traffic, fridge hum). Real speech amplitude is
      // consistently >0.05.
      const LOUD_AMP = 0.04;
      const isLoud   = maxAmp > LOUD_AMP;
      if (isLoud) {
        lastLoudFrameRef.current = now;
        loudStreakRef.current   += 1;

        // 🆕 Track cumulative speech time across the turn.
        // Only count when isLoud — silence between words shouldn't accumulate.
        const dt = lastFrameTimeRef.current ? (now - lastFrameTimeRef.current) : 0;
        // Cap dt at ~300ms to avoid huge jumps if frames were dropped.
        if (dt > 0 && dt < 300) {
          accumulatedSpeechTimeRef.current += dt;
        }
      } else {
        loudStreakRef.current = 0;
      }
      lastFrameTimeRef.current = now;

      // Track when user started speaking this turn (for timing log).
      // 🆕 2026-04-25: Raised from 3 → 5 frames (~1280ms @ 4096/16kHz).
      // Senior users often make filler sounds ("음", "어", "그러니까") that
      // last 800-1200ms. Requiring 1280ms+ of sustained loud frames
      // filters most fillers while still catching genuine speech onset.
      const LOUD_STREAK_TO_START = 5;
      if (isLoud
        && loudStreakRef.current >= LOUD_STREAK_TO_START
        && !hasSpokenThisTurnRef.current) {
        hasSpokenThisTurnRef.current = true;
        turnStartRef.current = now;
        accumulatedSpeechTimeRef.current = 0; // 🆕 reset for new turn
        lastFrameTimeRef.current = now;       // 🆕 reset for new turn
        console.log('[Turn] User speech started at:', now);
        try {
          if (ws.readyState === 1) {
            console.log('[WS send] activity_start at', Date.now());
            ws.send(JSON.stringify({
              realtime_input: { activity_start: {} }
            }));
          }
        } catch (err) {
          console.warn('[WS send] activity_start failed:', err?.message);
        }
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
    // 🔥 Task 50: silence in-flight Emma audio while we cycle the WS.
    //    The mic stream itself is reused on the new connection, so we
    //    deliberately do NOT stop micStreamRef tracks here.
    killActiveAudioSources();
    nextPlayTimeRef.current = 0;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    clearInterval(audioMonitorRef.current);
    audioMonitorRef.current = null;

    clearInterval(thinkingTimerRef.current);
    thinkingTimerRef.current = null;
    clearTimeout(thinkingDelayRef.current);
    thinkingDelayRef.current = null;
    hasSpokenThisTurnRef.current = false;
    isAiSpeakingRef.current      = false;
    speechEndedLoggedRef.current = false;
    thinkingShownAtRef.current   = 0;
    accumulatedSpeechTimeRef.current = 0; // 🆕 2026-04-25
    lastFrameTimeRef.current     = 0;     // 🆕 2026-04-25
    loudStreakRef.current        = 0;     // 🆕 2026-04-25
    setIsConnected(false);
    setIsAiSpeaking(false);
    setIsThinking(false);
    setThinkingLevel(0);
    setLiveText('');
    setStatusMsg(getEmma(langRef.current).status_reconnecting);

    await new Promise(r => setTimeout(r, 1200));

    try {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
      startAudioContextMonitor();
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
          message            : pendingTopicRef.current || '',
          lang               : currentLang.toLowerCase(),
          conversationMode   : convModeRef.current,
          continueFragmentId : continueFragmentId || null, // 🆕 2026-04-25
          // 🆕 Task 60 (Stage 3) — Book mode handoff. When set, the server
          //   returns the Helper system prompt instead of the Emma one
          //   and stamps book_id + book_question_id on chat_sessions.
          bookId             : bookId || null,
          bookQuestionId     : bookQuestionId || null,
        }),
      });
      if (res.status === 402) {
        // 🆕 Task 66 — quota exceeded. Stop the session boot, show
        // "곧 출시 예정" modal, never light up the mic.
        const data = await res.json().catch(() => ({}));
        setQuotaBlocked(data);
        setMicOn(false);
        return;
      }
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
      startAudioContextMonitor();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicPermission('granted');
      openWS(stream, false);
    } catch (e) {
      // 🔥 Task 55 #3: distinguish permission denial from other errors.
      //   On most browsers the rejection is a DOMException whose name
      //   is 'NotAllowedError' (also 'PermissionDeniedError' on older
      //   WebKit). When that fires, flip micPermission so the banner
      //   renders, and clear the noisy raw-message status.
      const denied = e?.name === 'NotAllowedError' ||
                     e?.name === 'PermissionDeniedError' ||
                     /denied|permission/i.test(e?.message || '');
      if (denied) {
        setMicPermission('denied');
        setStatusMsg('');
      } else {
        setStatusMsg(`❌ ${e.message}`);
      }
      setMicOn(false);
    }
  }

  // 🔥 Task 55 #3: retry button handler. Re-runs connect(); if the user
  //   has now granted permission via the address-bar lock icon,
  //   getUserMedia will resolve and the chat session starts.
  async function retryMicAccess() {
    setMicPermission('unknown');
    setStatusMsg('');
    if (typeof connect === 'function') {
      try { await connect(); } catch {}
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  async function disconnect() {
    clearTimeout(reconnectTimerRef.current);
    isReconnectingRef.current = false;
    // 🔥 Task 50: null wsRef BEFORE close() so onclose treats this as
    //    user-initiated and skips silentReconnect. (Was already correct,
    //    keeping the order explicit.)
    const ws = wsRef.current;
    wsRef.current = null;
    try { ws?.close(); } catch {}
    stopMic();
    // 🔥 Stop the mic hardware itself, not just the audio graph.
    try { micStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    micStreamRef.current = null;
    // 🔥 Kill any in-flight Emma audio that hasn't started yet (or is mid-
    //    playback). audioCtx.close() below would normally cancel them, but
    //    sources scheduled in the same tick can race.
    killActiveAudioSources();
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    clearInterval(audioMonitorRef.current);
    audioMonitorRef.current = null;
    nextPlayTimeRef.current = 0;

    clearInterval(thinkingTimerRef.current);
    thinkingTimerRef.current = null;
    clearTimeout(thinkingDelayRef.current);
    thinkingDelayRef.current = null;
    hasSpokenThisTurnRef.current = false;
    isAiSpeakingRef.current      = false;
    speechEndedLoggedRef.current = false;
    thinkingShownAtRef.current   = 0;
    accumulatedSpeechTimeRef.current = 0; // 🆕 2026-04-25
    lastFrameTimeRef.current     = 0;     // 🆕 2026-04-25
    loudStreakRef.current        = 0;     // 🆕 2026-04-25
    setIsConnected(false);
    setMicOn(false);
    setLiveText('');
    setIsAiSpeaking(false);
    setIsThinking(false);
    setThinkingLevel(0);
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

  // ── forceStop ────────────────────────────────────────────────────────────
  // 🔥 Task 50 — synchronous emergency teardown for component unmount.
  //
  // Why this exists:
  //   disconnect() above is the user-initiated path: it sets UI state,
  //   shows the feedback modal, awaits, etc. But on unmount the component
  //   is already going away — calling setX() throws the React "set state
  //   on unmounted component" warning, the feedback modal is never seen,
  //   and worse, queued audio chunks can keep playing because no one
  //   stops them. The "ghost Emma" bug.
  //
  // What this does (no awaits, no UI side effects):
  //   1. Mark unmounted so onclose/onmessage/onaudioprocess all bail.
  //   2. Stash session data via navigator.sendBeacon (survives the
  //      unmount and a page navigation; auth via _token in body since
  //      beacon can't set Authorization header).
  //   3. Clear every timer.
  //   4. Null wsRef BEFORE close() so the soon-to-fire onclose treats
  //      it as user-initiated and skips silentReconnect.
  //   5. Kill every tracked BufferSourceNode so any chunk already
  //      pushed to the AudioContext stops mid-flight.
  //   6. Stop mic stream tracks (releases the hardware mic).
  //   7. Close AudioContext + release wake lock.
  function forceStop() {
    // Idempotent
    if (unmountedRef.current && !wsRef.current && !audioCtxRef.current) return;
    unmountedRef.current = true;

    const sid = sessionIdRef.current;
    const t   = tokenRef.current || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    const transcript = transcriptRef.current || [];

    // 1. Persist the session — sendBeacon survives unmount and tab
    //    navigation. Empty/short transcripts are still OK to send;
    //    /api/chat/end gracefully no-ops below the threshold.
    if (sid && t && transcript.length >= 2) {
      try {
        const payload = JSON.stringify({
          sessionId       : sid,
          transcript,
          conversationMode: convModeRef.current,
          _token          : t,
        });
        // 🔥 Task 54: keepalive fetch fallback when payload exceeds the
        //   ~64 KB sendBeacon cap. A 5-minute story easily breaches it.
        const BEACON_LIMIT = 60_000;
        let beaconOk = false;
        if (payload.length <= BEACON_LIMIT) {
          try {
            beaconOk = navigator.sendBeacon(
              '/api/chat/end',
              new Blob([payload], { type: 'application/json' })
            );
          } catch {}
        }
        if (!beaconOk) {
          try {
            fetch('/api/chat/end', {
              method   : 'POST',
              headers  : { 'Content-Type': 'application/json' },
              body     : payload,
              keepalive: true,
            }).catch(() => {});
          } catch {}
        }
      } catch {}
    }
    // 2. Per-user usage minutes (best-effort beacon)
    if (sessionStartRef.current && t) {
      try {
        const mins = (Date.now() - sessionStartRef.current) / 60000;
        const usagePayload = JSON.stringify({
          minutesUsed: mins,
          turnsCount : turnsRef.current,
          _token     : t,
        });
        navigator.sendBeacon('/api/usage', new Blob([usagePayload], { type: 'application/json' }));
      } catch {}
    }

    // 3. Timers
    clearTimeout(reconnectTimerRef.current);
    clearInterval(thinkingTimerRef.current);
    clearTimeout(thinkingDelayRef.current);
    clearInterval(audioMonitorRef.current);
    reconnectTimerRef.current = null;
    thinkingTimerRef.current  = null;
    thinkingDelayRef.current  = null;
    audioMonitorRef.current   = null;

    // 4. WebSocket — null BEFORE close() so onclose skips reconnect.
    const ws = wsRef.current;
    wsRef.current = null;
    try { ws?.close(); } catch {}

    // 5. Audio playback — kill every queued source.
    killActiveAudioSources();

    // 6. Mic — disconnect the audio graph AND release the hardware.
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect();    } catch {}
    processorRef.current = null;
    sourceRef.current    = null;
    try { micStreamRef.current?.getTracks().forEach(tr => tr.stop()); } catch {}
    micStreamRef.current = null;

    // 7. AudioContext + wake lock
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    nextPlayTimeRef.current = 0;
    try { releaseWakeLock(); } catch {}

    sessionIdRef.current   = null;
    sessionStartRef.current = null;
    isReconnectingRef.current = false;
  }

  // 🔥 Task 50 — unmount cleanup. Runs when EmmaChat is leaving the DOM
  //    (router.push, browser back, tab close mid-session, hot reload).
  //    Without this effect every navigation away while Emma was speaking
  //    left a zombie session behind, and the next /chat visit produced
  //    multiple Emmas talking on top of each other.
  //
  //    NOTE: explicitly reset unmountedRef to false on mount. React 19
  //    StrictMode + Next.js Fast Refresh can re-run the effect's cleanup
  //    on the same component instance during dev, and a stray `true`
  //    here would silently kill every subsequent WS message — which is
  //    exactly what happened on the first deploy of this fix (Emma
  //    appeared "stuck on connecting" because ws.onmessage early-returned
  //    on the unmount guard).
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      forceStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // 🔥 Task 56 (a): acquire wake lock IN the gesture handler so iOS
      //   Safari accepts the NoSleep video.play() call.
      _gestureAcquireWakeLock();
      connect();
    }
  }, [micOn, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔥 Task 56 (a): the iOS Safari NoSleep video must be started inside
  //   a synchronous user-gesture handler — calling acquire() from a
  //   useEffect that fires when isConnected later flips loses that
  //   gesture context, so video.play() rejects and the screen still
  //   sleeps mid-conversation. We acquire here at the moment of the
  //   button tap. The matching release stays in the isConnected effect.
  function _gestureAcquireWakeLock() {
    try {
      if (wakeLockRef.current?.acquire) {
        // Fire-and-forget; acquire() awaits internally for native lock.
        Promise.resolve(wakeLockRef.current.acquire()).catch(() => {});
      }
    } catch {}
  }

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
    _gestureAcquireWakeLock();
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
    _gestureAcquireWakeLock();
    connect();
  }

  // 🆕 Task 49: auto-start the chosen mode when the home page handed us
  //   ?mode=companion or ?mode=story. Wait until user/token are loaded
  //   (otherwise connect() bails out and the user is stranded on a
  //   welcome screen we've also hidden). Fires exactly once via a ref
  //   guard, so re-renders or back/forward navigation don't re-trigger.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!initialModeFromUrl) return;
    if (!user || !token) return;
    if (isConnected) return;
    autoStartedRef.current = true;
    startCustomTopic(initialModeFromUrl);
  }, [initialModeFromUrl, user, token, isConnected]);

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
        <button className={styles.backBtn} onClick={() => { disconnect(); router.push('/'); }}>←</button>

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

      {/* 🆕 Task 60 (Stage 3) — book progress strip. Compact horizontal
          row above the chat area when /chat?mode=book is active. Tells
          the senior at a glance which question they are on. */}
      {isBookMode && bookContext && (
        <div className={styles.bookContextBar}>
          <span className={styles.bookContextChapter}>
            📖 {bookContext.chapterOrder ? `챕터 ${bookContext.chapterOrder}: ` : ''}
            {bookContext.chapterTitle}
          </span>
          <span className={styles.bookContextProgress}>
            질문 {bookContext.questionOrder ?? '?'}
          </span>
        </div>
      )}

      {/* ── chat scroll area ── */}
      <div className={styles.chatArea} ref={scrollRef}>

        {/* 🔥 Task 55 #3: microphone-denied banner. Shown only when the
            browser has reported denied permission. The retry button
            calls getUserMedia again — once the user toggles "Allow"
            in the address-bar lock icon, the request resolves and we
            proceed into the session. KO/EN/ES localised. */}
        {micPermission === 'denied' && !isConnected && (
          <div className={`${styles.micDeniedBanner} ${isDay ? styles.micDeniedBannerDay : styles.micDeniedBannerNight}`}>
            <div className={styles.micDeniedTitle}>{emma.micDeniedTitle}</div>
            <div className={styles.micDeniedHint}>{emma.micDeniedHint}</div>
            <button
              className={styles.retryMicBtn}
              onClick={retryMicAccess}
              type="button"
            >
              {emma.micRetryBtn}
            </button>
          </div>
        )}

        {/* ── New Welcome Screen (2026-04-24): 2 fixed cards + scrollable fragment list ── */}
        {/* When ?mode= is present the auto-start effect will connect us in
            a moment — hide the welcome cards so they don't flash. */}
        {messages.length === 0 && !isConnected && !initialModeFromUrl && (() => {
          const wmsgs    = WELCOME_MSGS[lang] || WELCOME_MSGS.KO;
          const nw       = wmsgs.newWelcome;
          const frags    = Array.isArray(userFragments) ? userFragments : [];
          const loading  = userFragments === null;
          const fragCount = frags.length;

          return (
            <div className={`${styles.welcomeV2} ${isDay ? styles.welcomeDay : styles.welcomeNight}`}>

              {/* Card 1: Just talk (companion mode) */}
              <button
                type="button"
                className={`${styles.welcomeCard} ${styles.companionCard} ${isDay ? styles.cardDay : styles.cardNight}`}
                onClick={() => startCustomTopic('companion')}
                disabled={isConnected}
              >
                <div className={styles.cardHeader}>
                  <MicSvgSmall />
                  <span className={styles.cardTitle}>{nw.companionTitle}</span>
                  <span className={styles.privateLabel}>{nw.privateLabel}</span>
                </div>
                <div className={styles.cardSpacer} />
              </button>

              {/* Card 2: Record my story (story mode) */}
              <button
                type="button"
                className={`${styles.welcomeCard} ${styles.storyCard} ${isDay ? styles.cardDay : styles.cardNight}`}
                onClick={() => startCustomTopic('story')}
                disabled={isConnected}
              >
                <div className={styles.cardHeader}>
                  <MicSvgSmall />
                  <span className={styles.cardTitle}>{nw.storyTitle}</span>
                </div>
                <div className={styles.cardMeta}>
                  {fragCount > 0 ? nw.storyCountLabel(fragCount) : nw.storyCountEmpty}
                </div>
                <div className={styles.cardSpacer} />
              </button>

              {/* Card 3: Fragment list (scrollable) — entire section links to /my-stories */}
              <button
                type="button"
                className={`${styles.fragmentListCard} ${isDay ? styles.cardDay : styles.cardNight}`}
                onClick={() => { disconnect(); router.push('/my-stories'); }}
              >
                <div className={styles.fragmentListHeader}>{nw.fragmentListHead}</div>
                <div className={styles.fragmentListDivider} />
                <div className={styles.fragmentListScroll}>
                  {loading ? (
                    <div className={styles.fragmentListEmpty}>…</div>
                  ) : fragCount === 0 ? (
                    <div className={styles.fragmentListEmpty}>{nw.fragmentListEmpty}</div>
                  ) : (
                    frags.map((f) => (
                      <div key={f.id} className={styles.fragmentListItem}>
                        <span className={styles.fragmentIcon}>📄</span>
                        <span className={styles.fragmentTitle}>{f.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </button>

            </div>
          );
        })()}

        {messages.map(msg => (
          <Bubble key={msg.id} msg={msg} mode={mode} />
        ))}
        {(isAiSpeaking || liveText || isThinking) && (
          <TypingIndicator mode={mode} liveText={liveText} thinkingLevel={thinkingLevel} lang={lang} />
        )}
        {/* System status note (shown only when disconnected + status exists) */}
        {!isConnected && statusMsg && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <span style={{ fontSize: 11, color: isDay ? '#c0a090' : 'rgba(255,255,255,0.3)' }}>
              {statusMsg}
            </span>
          </div>
        )}

        {/* ── Post-session banner (Task 54 #4): polls /api/fragments
              every 5 seconds for up to 90 seconds so the message can
              flip from "정리 중" → "준비됐어요" once the fragment lands.
              Without this the user closed the page guessing whether
              their 5-minute story actually saved. */}
        {sessionEnded && !isConnected && !showFeedback && (
          <SessionEndBanner
            lang={lang}
            isDay={isDay}
            sessionStartedAt={sessionStartRef.current /* may be null after reset */}
            bookContext={isBookMode ? { bookId, bookQuestionId } : null}
          />
        )}
      </div>

      {/* ── STT warning banner only (Task 56 b — bulletproof) ──────────
          The user-facing caption is GONE. Even the debug-flag path was
          reportedly leaking captions back into Tim's UI after a Vercel
          cache cycle, so the JSX itself is removed — there's nothing
          left to render the user STT to the screen. The userLiveText
          state and detectBurst() still run so the warning banner here
          can flag actual STT collapse (the genuine signal worth
          showing). Toggle button is fully removed. */}
      {(isConnected || messages.length > 0) && sttWarning && (
        <div className={`${styles.sttStrip} ${isDay ? styles.sttStripDay : styles.sttStripNight}`}>
          <div className={`${styles.sttWarn} ${isDay ? styles.sttWarnDay : styles.sttWarnNight}`}>
            {sttWarning}
          </div>
        </div>
      )}

      {/* ── voice bottom bar (hidden on welcome; shown during/after a session) ── */}
      {(isConnected || messages.length > 0) && (
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
      )}

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
                    onClick={() => { setShowFeedback(false); router.push('/'); }}
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

      {/* 🆕 Task 66 — quota-block modal. Lazy-rendered so it costs
          nothing on the happy path. */}
      {quotaBlocked && (
        <QuotaBlockedModal
          data={quotaBlocked}
          onClose={() => { setQuotaBlocked(null); router.push('/'); }}
        />
      )}

    </div>
  );
}

// ── small SVG icons ───────────────────────────────────────────────────────────
function MicSvgSmall() {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden="true"
         className={styles.cardMicIcon}>
      <rect x="7" y="2" width="6" height="10" rx="3" fill="currentColor"/>
      <path d="M4 10c0 3.31 2.69 6 6 6s6-2.69 6-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <line x1="10" y1="16" x2="10" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
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
