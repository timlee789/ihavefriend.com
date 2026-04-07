'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CHARACTERS, getCharacterLocale } from '@/lib/characters';
import EmmaAvatar3D from '@/components/EmmaAvatar3D';
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
  const nextPlayTimeRef   = useRef(0); // Web Audio scheduled playback time
  const sessionStartRef   = useRef(null);
  const turnsRef          = useRef(0);
  const transcriptRef     = useRef([]);
  const sessionIdRef      = useRef(null);
  const currentUserMsgRef = useRef('');
  const currentAiMsgRef  = useRef('');
  const wakeLockRef       = useRef(null);
  const transcriptEndRef  = useRef(null); // auto-scroll

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
    // Show "Add to Home Screen" banner if not already installed
    if (!isAppInstalled()) {
      setupInstallPrompt(() => setShowInstallBanner(true));
    }
    // Ask push permission after user has had at least 1 prior conversation
    const talked = parseInt(localStorage.getItem('conversationCount') || '0');
    if (talked >= 1 && Notification.permission === 'default') {
      setShowPushPrompt(true);
    }
  }, []);

  async function handleEnablePush() {
    setShowPushPrompt(false);
    await requestPushPermission(user?.id, token);
  }

  async function handleInstall() {
    const accepted = await showInstallPrompt();
    if (accepted) setShowInstallBanner(false);
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

    try {
      // No sampleRate override — let browser use its native rate (44100/48000)
      // iOS Safari and Android reject forced 16000 Hz, causing silent audio
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      // Resume in case browser suspended the context (required on iOS)
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        const ws = new WebSocket(
          `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${geminiKey}`
        );
        wsRef.current = ws;

        ws.onopen = () => {
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
              system_instruction: { parts: [{ text: systemPrompt }] },
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
            ws.send(JSON.stringify({
              client_content: {
                turns: [{ role: 'user', parts: [{ text: char.greeting || 'Hello, please greet me warmly.' }] }],
                turn_complete: true,
              }
            }));
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

          // AI transcript: only update liveText during streaming (NOT transcript yet)
          const aiTranscript = msg.serverContent?.outputTranscription?.text ?? msg.outputTranscription?.text;
          if (aiTranscript) {
            currentAiMsgRef.current += aiTranscript;
            setLiveText(currentAiMsgRef.current);
            setSubtitle(currentAiMsgRef.current); // live subtitle under avatar
          }

          // User transcript: accumulate (shown in transcript on turnComplete)
          const userTranscript = msg.serverContent?.inputTranscription?.text ?? msg.inputTranscription?.text;
          if (userTranscript) {
            currentUserMsgRef.current += userTranscript;
          }

          if (msg.serverContent?.turnComplete) {
            const turnNum = ++turnsRef.current;
            const aiMsg   = currentAiMsgRef.current.trim();
            const userMsg = currentUserMsgRef.current.trim();

            // Now commit both messages to transcript (one bubble each)
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
            // Keep last AI message as subtitle for 8 seconds, then fade
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
              }).catch(() => {});
            }
          }
        };

        ws.onclose = (evt) => {
          setIsConnected(false);
          setIsListening(false);
          stopMic();
          if (wsRef.current !== null) setStatus(`❌ ${evt.reason || `Disconnected (${evt.code})`}`);
        };
        ws.onerror = () => setStatus('❌ Connection error.');

        // Mic setup — capture at browser native rate, downsample to 16000 Hz for Gemini
        const nativeRate = audioCtxRef.current.sampleRate; // e.g. 44100 or 48000
        const targetRate = 16000;
        const micSource = audioCtxRef.current.createMediaStreamSource(stream);
        const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== 1) return;
          const input = e.inputBuffer.getChannelData(0);
          // Downsample: pick every N-th sample to reach 16000 Hz
          const ratio = nativeRate / targetRate;
          const outLen = Math.floor(input.length / ratio);
          const downsampled = new Float32Array(outLen);
          for (let i = 0; i < outLen; i++) {
            downsampled[i] = input[Math.floor(i * ratio)];
          }
          const i16 = new Int16Array(outLen);
          for (let i = 0; i < outLen; i++) {
            i16[i] = Math.max(-32768, Math.min(32767, downsampled[i] * 32768));
          }
          const b64 = btoa(String.fromCharCode(...new Uint8Array(i16.buffer)));
          ws.send(JSON.stringify({ realtime_input: { media_chunks: [{ mime_type: 'audio/pcm;rate=16000', data: b64 }] } }));
        };
        micSource.connect(processor);
        processor.connect(audioCtxRef.current.destination);
        processorRef.current = processor;
        sourceRef.current = micSource;
      });
    } catch (e) {
      setStatus(`❌ ${e.message}`);
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
    wsRef.current?.close();
    wsRef.current = null;
    stopMic();
    setIsConnected(false);
    setIsListening(false);
    setLiveText('');
    setIsAiSpeaking(false);
    setSubtitle('');
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    nextPlayTimeRef.current = 0;
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
            <button style={S.pwaDismissBtn} onClick={() => setShowInstallBanner(false)}>✕</button>
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
            <button style={S.pwaDismissBtn} onClick={() => setShowPushPrompt(false)}>✕</button>
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

      {/* ── 3D Avatar hero (60% of remaining screen) ─── */}
      <div style={S.avatarHero}>
        <EmmaAvatar3D
          isSpeaking={isAiSpeaking}
          isListening={isListening && isConnected}
          emotionData={emotionData}
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

        {/* CC toggle */}
        <button
          style={S.ccBtn}
          onClick={() => setSubtitlesOn(v => !v)}
          title="Toggle subtitles"
        >
          CC {subtitlesOn ? 'ON' : 'OFF'}
        </button>

        {/* Transcript toggle */}
        {transcript.length > 0 && (
          <button
            style={S.transcriptToggleBtn}
            onClick={() => setShowTranscript(v => !v)}
          >
            {showTranscript
              ? tx('Hide', '숨기기', 'Ocultar')
              : tx('Transcript', '대화 보기', 'Transcripción')}
          </button>
        )}
      </div>

      {/* ── Subtitle bar ─────────────────────────────── */}
      {subtitlesOn && (subtitle || liveText) && (
        <div style={S.subtitleBar}>
          <p style={S.subtitleText}>
            {liveText || subtitle}
            {liveText && <span style={S.cursor}>▌</span>}
          </p>
        </div>
      )}

      {/* ── Welcome card (not connected, no status) ─── */}
      {!isConnected && !status && !subtitle && (
        <div style={S.welcomeCard}>
          <p style={S.welcomeGreeting}>
            {tx(
              `Hi${userName ? `, ${userName}` : ''}! 😊`,
              `안녕하세요, ${userName}! 😊`,
              `¡Hola${userName ? `, ${userName}` : ''}! 😊`
            )}
          </p>
          <p style={S.welcomeText}>
            {tx(
              `I'm ${char.name}. What would you like to talk about today?`,
              `저는 ${char.name}이에요. 오늘 무슨 이야기 나눌까요?`,
              `Soy ${char.name}. ¿De qué te gustaría hablar hoy?`
            )}
          </p>
        </div>
      )}

      {/* ── Status message ───────────────────────────── */}
      {status && (
        <div style={{
          ...S.statusCard,
          background: status.startsWith('❌') ? C.dangerLight : C.coralLight,
          borderColor: status.startsWith('❌') ? '#FECACA' : C.coralBorder,
        }}>
          <p style={{ ...S.statusText, color: status.startsWith('❌') ? C.danger : C.coral }}>{status}</p>
        </div>
      )}

      {/* ── Transcript panel (hidden by default) ──────── */}
      {showTranscript && transcript.length > 0 && (
        <div style={S.transcriptPanel}>
          {transcript.map((t, i) => (
            <div key={i} style={{ padding: '4px 0', fontSize: 13, color: t.role === 'assistant' ? C.coral : C.textMid }}>
              <strong style={{ color: t.role === 'assistant' ? C.coral : C.green }}>
                {t.role === 'assistant' ? char.name : tx('You', '나', 'Tú')}:
              </strong>{' '}
              {t.text}
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

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

  // ── Avatar hero ──────────────────────────────────────────────
  avatarHero: {
    position: 'relative',
    width: '100%',
    maxWidth: 560,
    flex: '1 1 0',       // takes all available space between topbar and controls
    minHeight: 0,
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

  // ── Subtitle bar ─────────────────────────────────────────────
  subtitleBar: {
    width: '100%',
    maxWidth: 560,
    padding: '10px 24px',
    background: 'rgba(0,0,0,0.72)',
    flexShrink: 0,
    animation: 'subtitleFadeIn 0.3s ease',
  },
  subtitleText: {
    margin: 0,
    fontSize: 16,
    color: '#fff',
    lineHeight: 1.55,
    textAlign: 'center',
    fontWeight: 400,
  },

  // ── Transcript panel ─────────────────────────────────────────
  transcriptPanel: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '22vh',
    overflowY: 'auto',
    padding: '10px 20px',
    background: C.surface,
    borderTop: `1px solid ${C.border}`,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },

  // Welcome card
  welcomeCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: '16px 20px',
    margin: '0 20px',
    maxWidth: 520,
    width: 'calc(100% - 40px)',
    borderLeft: `4px solid ${C.coralBorder}`,
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
    flexShrink: 0,
  },
  welcomeGreeting: { fontSize: 17, fontWeight: 700, color: C.textPrimary, margin: '0 0 4px' },
  welcomeText: { fontSize: 15, color: C.textMid, margin: 0, lineHeight: 1.6 },

  // Status card
  statusCard: {
    border: '1px solid',
    borderRadius: 14,
    padding: '10px 20px',
    margin: '0 20px',
    maxWidth: 520,
    width: 'calc(100% - 40px)',
    flexShrink: 0,
  },
  statusText: { margin: 0, fontSize: 15, fontWeight: 500, textAlign: 'center' },

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
