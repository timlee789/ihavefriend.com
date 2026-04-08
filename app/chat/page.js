'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CHARACTERS, getCharacterLocale } from '@/lib/characters';
import EmmaAvatar from '@/components/EmmaAvatar';
import { requestPushPermission, setupInstallPrompt, showInstallPrompt, isAppInstalled } from '@/lib/pwaClient';

// ── Warm color palette ─────────────────────────────────────────
const C = {
  bg:         '#FFFCF8',  // warm white
  surface:    '#FFFFFF',
  border:     '#F0EBE3',
  textPrimary:'#1C1917',
  textMid:    '#78716C',
  textMuted:  '#A8A29E',
  coral:      '#F97316',  // Emma accent
  coralLight: '#FFF3EC',  // Emma bubble bg
  coralBorder:'#FDBA74',  // Emma bubble left border
  green:      '#16A34A',  // User accent
  greenLight: '#F0FDF4',  // User bubble bg
  greenBorder:'#86EFAC',  // User bubble left border
  danger:     '#DC2626',
  dangerLight:'#FEF2F2',
};

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams.get('character') || 'emma';
  // Fix: initialize 'en' for SSR, then read from user object (server-saved) after mount
  const [lang, setLang] = useState('en');
  const char = getCharacterLocale(CHARACTERS[characterId] || CHARACTERS.emma, lang);

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
  const currentAiMsgRef  = useRef('');
  const wakeLockRef       = useRef(null);
  const transcriptEndRef  = useRef(null);
  // Auto-reconnect refs
  const geminiKeyRef        = useRef('');
  const systemPromptBaseRef = useRef('');
  const micStreamRef        = useRef(null);
  const reconnectTimerRef   = useRef(null);
  const isReconnectingRef   = useRef(false);

  const [user, setUser]           = useState(null);
  const [token, setToken]         = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus]       = useState('');
  const [liveText, setLiveText]   = useState(''); // currently streaming text
  const [usage, setUsage]         = useState({ todayMinutes: 0, dailyLimit: 30, canChat: true });
  const [transcript, setTranscript] = useState([]);
  const [showMemory, setShowMemory] = useState(false);
  const [memoryDisplay, setMemoryDisplay] = useState('');
  const [isAiSpeaking, setIsAiSpeaking]   = useState(false);
  const [isListening, setIsListening]     = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showPushPrompt, setShowPushPrompt]       = useState(false);
  // Persistent small-button state (shown after banner dismissed)
  const [installBannerSeen, setInstallBannerSeen] = useState(false);
  const [pushBannerSeen,    setPushBannerSeen]    = useState(false);
  const [isInstalled,       setIsInstalled]       = useState(false);
  const [installPromptReady,setInstallPromptReady]= useState(false);
  const [notifPermission,   setNotifPermission]   = useState('default');
  const [subtitle, setSubtitle]           = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [subtitlesOn, setSubtitlesOn]     = useState(true);
  const [emotionData, setEmotionData]     = useState(null);
  const subtitleTimerRef                  = useRef(null);

  // ── Language cycle: EN → KO → ES → EN ───────────────────────
  const LANGS = ['en', 'ko', 'es'];
  function cycleLang() {
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    setLang(next);
    localStorage.setItem('lang', next);
    // Update user object in localStorage so lang survives page refresh
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    u.lang = next;
    localStorage.setItem('user', JSON.stringify(u));
    // Save to server — persists across devices
    const t = localStorage.getItem('token');
    if (t) {
      fetch('/api/user/lang', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ lang: next }),
      }).catch(() => {});
    }
  }

  // ── 3-language translation helper ────────────────────────────
  function tx(en, ko, es) {
    if (lang === 'ko') return ko;
    if (lang === 'es') return es;
    return en;
  }

  // ── Screen Wake Lock ─────────────────────────────────────────
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {}
  }
  function releaseWakeLock() {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }
  useEffect(() => {
    async function onVisibilityChange() {
      if (document.visibilityState === 'visible' && isConnected) await acquireWakeLock();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isConnected]);

  // ── Init ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u) { router.push('/login'); return; }
    setToken(t);
    setUser(u);
    // Use server-saved lang preference from user object (falls back to localStorage, then 'en')
    const userLang = u.lang || localStorage.getItem('lang') || 'en';
    setLang(userLang);
    localStorage.setItem('lang', userLang); // keep localStorage in sync
    fetchUsage(t);
    fetchMemory(t);
  }, [router]);

  // ── PWA: Install prompt + push permission ────────────────────
  useEffect(() => {
    // Restore dismissed state from localStorage
    const instSeen = localStorage.getItem('installBannerSeen') === 'true';
    const pushSeen = localStorage.getItem('pushBannerSeen') === 'true';
    setInstallBannerSeen(instSeen);
    setPushBannerSeen(pushSeen);

    // Current notification permission
    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission);
    }

    // Track if app gets installed during this session
    const onInstalled = () => { setIsInstalled(true); setShowInstallBanner(false); };
    window.addEventListener('appinstalled', onInstalled);

    // Show "Add to Home Screen" banner if not already installed
    if (!isAppInstalled()) {
      setupInstallPrompt(() => {
        setInstallPromptReady(true);
        // Only show big banner if not yet seen
        if (!instSeen) setShowInstallBanner(true);
      });
    } else {
      setIsInstalled(true);
    }

    // Ask push permission after user has had at least 1 prior conversation
    const talked = parseInt(localStorage.getItem('conversationCount') || '0');
    if (talked >= 1 && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      if (!pushSeen) setShowPushPrompt(true);
    }

    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  async function handleEnablePush() {
    setShowPushPrompt(false);
    await requestPushPermission(user?.id, token);
    if (typeof Notification !== 'undefined') setNotifPermission(Notification.permission);
  }

  function dismissInstallBanner() {
    setShowInstallBanner(false);
    setInstallBannerSeen(true);
    localStorage.setItem('installBannerSeen', 'true');
  }

  function dismissPushBanner() {
    setShowPushPrompt(false);
    setPushBannerSeen(true);
    localStorage.setItem('pushBannerSeen', 'true');
  }

  async function handleInstall() {
    const accepted = await showInstallPrompt();
    if (accepted) { setShowInstallBanner(false); setIsInstalled(true); }
  }

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, liveText]);

  async function fetchUsage(t) {
    try {
      const res = await fetch('/api/usage', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) setUsage(await res.json());
    } catch {}
  }

  async function fetchMemory(t) {
    try {
      const res = await fetch(`/api/memory?character=${characterId}`, {
        headers: { Authorization: `Bearer ${t || token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const facts = data.facts || [];
      setMemoryDisplay(facts.length > 0 ? facts.map(f => `• ${f}`).join('\n') : '');
    } catch {}
  }

  function buildSystemPrompt(memory) {
    const { facts = [], summary = '', transcript: prev = [] } = memory;
    const factsText = facts.length > 0 ? facts.map(f => `• ${f}`).join('\n') : 'Nothing yet.';
    const recentLines = prev.slice(-20).map(t => `${t.role === 'user' ? 'User' : char.name}: ${t.text}`).join('\n');
    return `${char.personality}\n\n[What you remember about this person]\n${factsText}\n\n[Summary of your previous conversations]\n${summary || 'This is your first conversation.'}\n\n${recentLines ? `[How your last conversation ended]\n${recentLines}` : ''}`.trim();
  }

  // ── Connect ──────────────────────────────────────────────────
  async function connect() {
    if (!usage.canChat) {
      setStatus(tx("You've reached today's limit. Come back tomorrow!", '오늘 대화 시간이 끝났어요. 내일 다시 만나요! 😊', '¡Has alcanzado el límite de hoy. Vuelve mañana! 😊'));
      return;
    }
    setStatus(tx('Connecting...', '연결 중...', 'Conectando...'));
    sessionStartRef.current = Date.now();
    turnsRef.current = 0;
    nextPlayTimeRef.current = 0;
    setTranscript([]);

    let systemPrompt = '', geminiKey = '';
    try {
      const res = await fetch('/api/chat/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: '', lang }),
      });
      if (res.ok) {
        const d = await res.json();
        systemPrompt = d.systemPrompt || '';
        geminiKey = d.geminiKey || '';
        sessionIdRef.current = d.sessionId || null;
        // Cache for auto-reconnect
        geminiKeyRef.current = geminiKey;
      }
    } catch (e) { console.warn('[Setup]', e.message); }

    if (!geminiKey) {
      setStatus('❌ Server API key not configured. Contact admin.');
      return;
    }
    if (!systemPrompt) {
      try {
        const r = await fetch(`/api/memory?character=${characterId}`, { headers: { Authorization: `Bearer ${token}` } });
        systemPrompt = buildSystemPrompt(r.ok ? await r.json() : {});
      } catch { systemPrompt = char.personality || ''; }
    }
    // Cache base prompt for auto-reconnect (without continuation context)
    systemPromptBaseRef.current = systemPrompt;

    try {
      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      openWS(stream, false);
    } catch (e) {
      setStatus(`❌ ${e.message}`);
    }
  }

  // ── Open (or re-open) the Gemini WebSocket ───────────────────
  // isReconnect=true  → skip greeting, inject recent transcript as context
  // isReconnect=false → normal first connect with greeting
  function openWS(stream, isReconnect) {
    const ws = new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${geminiKeyRef.current}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      // On reconnect, append recent conversation so Emma remembers the context
      let prompt = systemPromptBaseRef.current;
      if (isReconnect) {
        const recent = transcriptRef.current.slice(-10);
        if (recent.length > 0) {
          prompt += '\n\n[CONTINUING SESSION: You were just speaking with this user. '
            + 'The most recent exchanges were:\n'
            + recent.map(m => `${m.role === 'user' ? 'User' : 'You'}: ${m.text}`).join('\n')
            + '\nContinue the conversation naturally. Do NOT mention any reconnection or technical issues.]';
        }
      }
      ws.send(JSON.stringify({
        setup: {
          model: 'models/gemini-2.5-flash-native-audio-latest',
          generation_config: {
            response_modalities: ['AUDIO'],
            thinking_config: { thinking_budget: 0 },
            speech_config: { voice_config: { prebuilt_voice_config: { voice_name: char.voice } } },
          },
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
        setStatus('');
        setIsListening(true);
        acquireWakeLock();
        isReconnectingRef.current = false;

        if (!isReconnect) {
          // First connect: send greeting trigger
          ws.send(JSON.stringify({
            client_content: {
              turns: [{ role: 'user', parts: [{ text: char.greeting || 'Hello, please greet me warmly.' }] }],
              turn_complete: true,
            }
          }));
        }
        // On reconnect: just wait for user to speak (no greeting)

        // ── Pre-emptive reconnect at 14 min (before Gemini's ~15 min limit) ──
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (wsRef.current) silentReconnect(stream);
        }, 14 * 60 * 1000);
      }

      if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            scheduleChunk(base64ToPcm(part.inlineData.data));
            setIsAiSpeaking(true);
            setIsListening(false);
          }
        }
      }

      const aiTranscript = msg.serverContent?.outputTranscription?.text ?? msg.outputTranscription?.text;
      if (aiTranscript) {
        currentAiMsgRef.current += aiTranscript;
        setLiveText(currentAiMsgRef.current);
        setSubtitle(currentAiMsgRef.current);
      }

      const userTranscript = msg.serverContent?.inputTranscription?.text ?? msg.inputTranscription?.text;
      if (userTranscript) currentUserMsgRef.current += userTranscript;

      if (msg.serverContent?.turnComplete) {
        const turnNum = ++turnsRef.current;
        const aiMsg   = currentAiMsgRef.current.trim();
        const userMsg = currentUserMsgRef.current.trim();

        setTranscript(prev => {
          const next = [...prev];
          if (userMsg) next.push({ role: 'user', text: userMsg });
          if (aiMsg)   next.push({ role: 'assistant', text: aiMsg });
          transcriptRef.current = next;
          return next;
        });

        currentAiMsgRef.current  = '';
        currentUserMsgRef.current = '';
        setLiveText('');
        setIsAiSpeaking(false);
        setIsListening(true);

        if (aiMsg) {
          setSubtitle(aiMsg);
          if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
          subtitleTimerRef.current = setTimeout(() => setSubtitle(''), 8000);
        }

        if (userMsg && sessionIdRef.current) {
          fetch('/api/chat/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId: sessionIdRef.current, turnNumber: turnNum, userMessage: userMsg }),
          })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.emotion) setEmotionData(data.emotion); })
            .catch(() => {});
        }
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

      const isUserInitiated = wsRef.current === null; // disconnect() already nulled it
      if (isUserInitiated) return; // clean exit, nothing to do

      const reason = (evt.reason || '').toUpperCase();
      const isSessionLimit = reason.includes('CANCEL') || evt.code === 1011 || evt.code === 1013;

      if (isSessionLimit && !isReconnectingRef.current) {
        // Gemini session limit hit → auto-reconnect seamlessly
        silentReconnect(stream);
      } else {
        setIsConnected(false);
        setIsListening(false);
        if (evt.code !== 1000 && evt.code !== 1001) {
          setStatus(`❌ ${tx('Connection lost', '연결이 끊겼어요', 'Conexión perdida')} (${evt.code})`);
        }
      }
    };

    ws.onerror = () => {
      setIsAiSpeaking(false);
      setLiveText('');
      setStatus(`❌ ${tx('Connection error', '연결 오류', 'Error de conexión')}`);
    };

    // Mic: capture at native rate, downsample to 16000 Hz for Gemini
    const nativeRate = audioCtxRef.current.sampleRate;
    const ratio = nativeRate / 16000;
    const micSource = audioCtxRef.current.createMediaStreamSource(stream);
    const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== 1) return;
      const input = e.inputBuffer.getChannelData(0);
      const outLen = Math.floor(input.length / ratio);
      const i16 = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, input[Math.floor(i * ratio)] * 32768));
      }
      ws.send(JSON.stringify({
        realtime_input: { media_chunks: [{ mime_type: 'audio/pcm;rate=16000', data: btoa(String.fromCharCode(...new Uint8Array(i16.buffer))) }] }
      }));
    };
    micSource.connect(processor);
    processor.connect(audioCtxRef.current.destination);
    processorRef.current = processor;
    sourceRef.current = micSource;
  }

  // ── Silent reconnect — keeps transcript, reuses mic stream ───
  async function silentReconnect(stream) {
    if (isReconnectingRef.current) return;
    isReconnectingRef.current = true;

    // Null the ref first so onclose knows it's intentional
    const oldWs = wsRef.current;
    wsRef.current = null;
    try { oldWs?.close(); } catch {}
    stopMic();
    nextPlayTimeRef.current = 0;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;

    setIsConnected(false);
    setIsListening(false);
    setIsAiSpeaking(false);
    setLiveText('');
    setStatus(tx('Reconnecting...', '재연결 중...', 'Reconectando...'));

    await new Promise(r => setTimeout(r, 1200));

    try {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
      openWS(stream, true); // isReconnect = true
    } catch (e) {
      isReconnectingRef.current = false;
      setStatus(`❌ ${tx('Reconnection failed. Please tap Talk again.', '재연결 실패. 다시 대화 버튼을 눌러주세요.', 'Reconexión fallida.')}`);
    }
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

  // Gapless audio: schedule each chunk at the precise moment the previous ends
  // (used only when TalkingHead is not available — 2D fallback mode)
  function scheduleChunk(f32) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    // Start immediately if nothing scheduled yet; otherwise queue precisely
    const now = ctx.currentTime;
    const startAt = Math.max(nextPlayTimeRef.current, now + 0.04);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + buf.duration;
  }

  function stopMic() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
  }

  async function disconnect() {
    clearTimeout(reconnectTimerRef.current);
    isReconnectingRef.current = false;
    wsRef.current?.close();
    wsRef.current = null;
    stopMic();
    // Stop queued audio immediately
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    nextPlayTimeRef.current = 0;
    setIsConnected(false);
    setIsListening(false);
    setLiveText('');
    setIsAiSpeaking(false);
    setSubtitle('');
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    releaseWakeLock();

    if (sessionStartRef.current) {
      const mins = (Date.now() - sessionStartRef.current) / 60000;
      try {
        await fetch('/api/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ minutesUsed: mins, turnsCount: turnsRef.current }),
        });
        fetchUsage(token);
      } catch {}
    }

    if (sessionIdRef.current && transcript.length >= 2) {
      // Count completed conversations (for push permission timing)
      const prev = parseInt(localStorage.getItem('conversationCount') || '0');
      localStorage.setItem('conversationCount', String(prev + 1));

      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      setStatus(tx('✅ See you next time!', '✅ 다음에 또 이야기해요!', '✅ ¡Hasta la próxima!'));
      fetch('/api/chat/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: sid, transcript }),
      })
        .then(r => r.ok ? r.json() : {})
        .then(data => { if ((data.memoriesExtracted || 0) > 0) fetchMemory(token); })
        .catch(() => {});
    } else {
      sessionIdRef.current = null;
      setStatus('');
    }
  }

  if (!user) return <div style={{ background: C.bg, minHeight: '100vh' }} />;

  const userName = user.name || user.email?.split('@')[0] || '';

  return (
    <div style={S.page}>

      {/* ── Top bar ──────────────────────────────────── */}
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={() => { disconnect(); router.push('/chat?character=emma'); }}>
          {tx('← Home', '← 홈', '← Inicio')}
        </button>
        <div style={S.topCenter}>
          <div style={{ ...S.statusDot, background: isConnected ? '#16A34A' : C.textMuted }} />
          <span style={S.topName}>{char.name}</span>
        </div>
        <div style={S.topActions}>
          <button
            style={{
              ...S.smallBtn,
              opacity: isConnected ? 0.4 : 1,
              cursor: isConnected ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
              padding: '6px 14px',
              letterSpacing: '0.04em',
            }}
            onClick={isConnected ? undefined : cycleLang}
            title={isConnected ? 'End conversation to change language' : 'Change language'}
          >
            {lang === 'en' ? 'EN' : lang === 'ko' ? 'KO' : 'ES'}
          </button>
          <button style={S.smallBtn} onClick={() => setShowMemory(m => !m)} title="Memory">🧠</button>
        </div>
      </div>

      {/* ── Install banner (Add to Home Screen) ─────── */}
      {showInstallBanner && (
        <div style={S.pwaBanner}>
          <span style={S.pwaBannerText}>
            📱 {tx('Add Emma to your home screen', '홈 화면에 Emma 추가하기', 'Agrega a Emma a tu pantalla de inicio')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.pwaAcceptBtn} onClick={handleInstall}>
              {tx('Add', '추가', 'Agregar')}
            </button>
            <button style={S.pwaDismissBtn} onClick={dismissInstallBanner}>✕</button>
          </div>
        </div>
      )}

      {/* ── Push notification prompt ──────────────────── */}
      {showPushPrompt && (
        <div style={S.pwaBanner}>
          <span style={S.pwaBannerText}>
            🔔 {tx("Allow Emma to send you reminders?", "Emma가 알림을 보낼 수 있도록 허용할까요?", "¿Permitir que Emma te envíe recordatorios?")}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.pwaAcceptBtn} onClick={handleEnablePush}>
              {tx('Allow', '허용', 'Permitir')}
            </button>
            <button style={S.pwaDismissBtn} onClick={dismissPushBanner}>✕</button>
          </div>
        </div>
      )}

      {/* ── Memory drawer ────────────────────────────── */}
      {showMemory && (
        <div style={S.memDrawer}>
          <div style={S.memDrawerHeader}>
            <span style={S.memDrawerTitle}>
              {tx(`${char.name} remembers`, `${char.name}이 기억하는 것`, `Lo que recuerda ${char.name}`)}
            </span>
            <button style={S.memClose} onClick={() => setShowMemory(false)}>✕</button>
          </div>
          {memoryDisplay
            ? <pre style={S.memText}>{memoryDisplay}</pre>
            : <p style={S.memEmpty}>{tx('No memories yet. Start a conversation!', '아직 기억이 없어요. 대화를 시작해 보세요!', '¡Aún no hay recuerdos. ¡Empieza a conversar!')}</p>
          }
          <span style={S.usageLine}>
            {tx(
              `Today: ${usage.todayMinutes.toFixed(0)} / ${usage.dailyLimit} min`,
              `오늘 ${usage.todayMinutes.toFixed(0)}분 / 한도 ${usage.dailyLimit}분`,
              `Hoy: ${usage.todayMinutes.toFixed(0)} / ${usage.dailyLimit} min`
            )}
          </span>
        </div>
      )}

      {/* ── Avatar hero ──────────────────────────────── */}
      <div style={S.avatarHero}>
        <EmmaAvatar
          isSpeaking={isAiSpeaking}
          isListening={isListening && isConnected}
        />

        {/* State overlay — listening / speaking tag */}
        {isConnected && (
          <div style={S.stateOverlay}>
            {isAiSpeaking
              ? <><span style={{ ...S.stateDot, background: C.coral }} />{tx('Speaking...', '말하는 중...', 'Hablando...')}</>
              : isListening
                ? <><MicDots />{tx('Listening', '듣고 있어요', 'Escuchando')}</>
                : null
            }
          </div>
        )}

      </div>

      {/* ── Chat text area — Emma's current speech only ─ */}
      <div style={S.chatArea}>

        {/* Welcome (not connected, nothing said yet) */}
        {!isConnected && !status && !subtitle && !liveText && (
          <div style={S.chatWelcome}>
            <p style={S.chatGreet}>
              {tx(
                `Hi${userName ? `, ${userName}` : ''}! 😊`,
                `안녕하세요, ${userName}! 😊`,
                `¡Hola${userName ? `, ${userName}` : ''}! 😊`
              )}
            </p>
            <p style={S.chatHint}>
              {tx(
                `I'm ${char.name}. Tap the button below to start talking!`,
                `저는 ${char.name}이에요. 아래 버튼을 눌러 대화를 시작해 보세요!`,
                `Soy ${char.name}. ¡Toca el botón para empezar a hablar!`
              )}
            </p>
          </div>
        )}

        {/* Status (connecting / error) */}
        {status && (
          <div style={{
            ...S.statusBubble,
            color:      status.startsWith('❌') ? C.danger : C.coral,
            background: status.startsWith('❌') ? C.dangerLight : C.coralLight,
            border:     `1px solid ${status.startsWith('❌') ? '#FECACA' : C.coralBorder}`,
          }}>
            {status}
          </div>
        )}

        {/* Emma's current / last message — large text */}
        {(liveText || subtitle) && !status && (
          <p style={S.emmaText}>
            {liveText || subtitle}
            {liveText && <span style={S.cursor}>▌</span>}
          </p>
        )}

      </div>

      {/* ── Persistent setup chips (after banner dismissed, before setup done) ── */}
      {(() => {
        const showInst = installBannerSeen && !isInstalled && installPromptReady;
        const showPush = pushBannerSeen
          && typeof Notification !== 'undefined'
          && notifPermission === 'default';
        if (!showInst && !showPush) return null;
        return (
          <div style={S.setupRow}>
            {showInst && (
              <button style={S.setupChip} onClick={handleInstall}>
                📱 {tx('Add to Home', '홈 화면 추가', 'Añadir al inicio')}
              </button>
            )}
            {showPush && (
              <button style={S.setupChip} onClick={handleEnablePush}>
                🔔 {tx('Enable Reminders', '알림 설정', 'Activar alertas')}
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Controls ─────────────────────────────────── */}
      <div style={S.controls}>
        {!isConnected ? (
          <button style={S.talkBtn} onClick={connect}>
            🎙️ &nbsp;{tx(`Talk to ${char.name}`, `${char.name}와 대화하기`, `Hablar con ${char.name}`)}
          </button>
        ) : (
          <button style={S.endBtn} onClick={disconnect}>
            {tx('End conversation', '대화 끝내기', 'Terminar conversación')}
          </button>
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes subtitleFadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

// Animated mic dots
function MicDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', marginRight: 6 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: C.coral,
          display: 'inline-block',
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </span>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ background: C.bg, minHeight: '100vh' }} />}>
      <ChatPageInner />
    </Suspense>
  );
}

// ── Styles ────────────────────────────────────────────────────
const S = {
  page: {
    height: '100dvh',
    background: C.bg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: C.textPrimary,
    fontSize: 16,
    overflow: 'hidden',
  },

  // Top bar
  topBar: {
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    borderBottom: `1px solid ${C.border}`,
    flexShrink: 0,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: C.textMid,
    fontSize: 15,
    cursor: 'pointer',
    padding: '6px 4px',
    fontWeight: 500,
  },
  topCenter: { display: 'flex', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: '50%', transition: 'background 0.3s' },
  topName: { fontSize: 17, fontWeight: 700, color: C.textPrimary },
  topActions: { display: 'flex', gap: 6 },
  smallBtn: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '6px 10px',
    fontSize: 16,
    cursor: 'pointer',
    color: C.textPrimary,
  },

  // Memory drawer
  memDrawer: {
    width: '100%',
    maxWidth: 560,
    background: C.surface,
    borderBottom: `1px solid ${C.border}`,
    padding: '16px 24px',
    flexShrink: 0,
  },
  memDrawerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  memDrawerTitle: { fontWeight: 700, fontSize: 15, color: C.textPrimary },
  memClose: { background: 'none', border: 'none', color: C.textMuted, fontSize: 18, cursor: 'pointer' },
  memText: { color: C.textMid, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0 0 10px' },
  memEmpty: { color: C.textMuted, fontSize: 14, fontStyle: 'italic', margin: '0 0 10px' },
  usageLine: { fontSize: 12, color: C.textMuted },

  // ── Avatar hero — fixed smaller height ───────────────────────
  avatarHero: {
    position: 'relative',
    width: '100%',
    maxWidth: 560,
    flex: '0 0 auto',
    height: 'min(34dvh, 240px)',
    minHeight: 160,
    overflow: 'hidden',
  },

  // State overlay (listening/speaking) — bottom-center of avatar area
  stateOverlay: {
    position: 'absolute',
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.90)',
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: '5px 14px',
    fontSize: 14,
    color: C.textMid,
    fontWeight: 500,
    backdropFilter: 'blur(6px)',
    zIndex: 10,
    pointerEvents: 'none',
  },
  stateDot: { width: 8, height: 8, borderRadius: '50%', marginRight: 8 },

  // CC button — top-right of avatar
  ccBtn: {
    position: 'absolute',
    top: 12, right: 12,
    background: 'rgba(0,0,0,0.35)',
    border: 'none',
    color: '#fff',
    borderRadius: 16,
    padding: '5px 11px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.05em',
    zIndex: 10,
  },

  // Transcript toggle — top-left of avatar
  transcriptToggleBtn: {
    position: 'absolute',
    top: 12, left: 12,
    background: 'rgba(0,0,0,0.35)',
    border: 'none',
    color: '#fff',
    borderRadius: 16,
    padding: '5px 11px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    zIndex: 10,
  },

  // ── Chat text area ────────────────────────────────────────────
  chatArea: {
    flex: '1 1 0',
    minHeight: 0,
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '16px 24px',
    background: C.bg,
    borderTop: `1px solid ${C.border}`,
    overflow: 'hidden',
  },

  // Welcome / empty state
  chatWelcome: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 8,
  },
  chatGreet: { fontSize: 20, fontWeight: 700, color: C.textPrimary, margin: 0 },
  chatHint:  { fontSize: 15, color: C.textMuted, margin: 0, lineHeight: 1.65 },

  // Status
  statusBubble: {
    borderRadius: 12,
    padding: '10px 18px',
    fontSize: 15,
    fontWeight: 500,
    textAlign: 'center',
  },

  // Emma's current speech — large, centred
  emmaText: {
    margin: 0,
    fontSize: 20,
    fontWeight: 400,
    color: C.textPrimary,
    lineHeight: 1.7,
    textAlign: 'center',
    animation: 'subtitleFadeIn 0.25s ease',
  },

  cursor: { animation: 'blink 1s step-end infinite', marginLeft: 2 },

  // PWA banners
  pwaBanner: {
    width: '100%',
    maxWidth: 560,
    background: '#FFF7ED',
    borderBottom: `1px solid #FDBA74`,
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pwaBannerText: {
    fontSize: 14,
    color: '#92400E',
    flex: 1,
    lineHeight: 1.4,
  },
  pwaAcceptBtn: {
    background: '#F97316',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  pwaDismissBtn: {
    background: 'none',
    border: 'none',
    color: '#A8A29E',
    fontSize: 16,
    cursor: 'pointer',
    padding: '4px 6px',
  },

  // ── Persistent setup chips ────────────────────────────────────
  setupRow: {
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    padding: '6px 20px 2px',
    flexShrink: 0,
  },
  setupChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: '5px 14px',
    fontSize: 12,
    fontWeight: 500,
    color: C.textMid,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },

  // Controls
  controls: {
    padding: '20px 20px 0',
    width: '100%',
    maxWidth: 560,
    marginTop: 'auto',
  },
  talkBtn: {
    width: '100%',
    padding: '20px',
    background: C.coral,
    color: '#fff',
    borderRadius: 18,
    fontSize: 19,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    boxShadow: `0 4px 20px ${C.coral}44`,
    letterSpacing: '0.01em',
  },
  endBtn: {
    width: '100%',
    padding: '18px',
    background: C.surface,
    color: C.textMid,
    borderRadius: 18,
    fontSize: 17,
    fontWeight: 600,
    border: `1px solid ${C.border}`,
    cursor: 'pointer',
  },
};
