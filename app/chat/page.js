'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CHARACTERS, getCharacterLocale } from '@/lib/characters';
import AvatarEmma from '@/components/avatars/AvatarEmma';

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
  // Fix: initialize 'en' for SSR, then read localStorage after mount
  const [lang, setLang] = useState('en');
  useEffect(() => {
    const saved = localStorage.getItem('lang') || 'en';
    setLang(saved);
  }, []);
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

  // ── Language cycle: EN → KO → ES → EN ───────────────────────
  const LANGS = ['en', 'ko', 'es'];
  function cycleLang() {
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    setLang(next);
    localStorage.setItem('lang', next);
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
    fetchUsage(t);
    fetchMemory(t);
  }, [router]);

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
      setStatus(lang === 'ko' ? '오늘 대화 시간이 끝났어요. 내일 다시 만나요! 😊' : "You've reached today's limit. Come back tomorrow!");
      return;
    }
    setStatus(lang === 'ko' ? '연결 중...' : 'Connecting...');
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
            setLiveText(currentAiMsgRef.current); // shown as streaming bubble only
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
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      setStatus(lang === 'ko' ? '✅ 다음에 또 이야기해요!' : '✅ See you next time!');
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
        <button style={S.backBtn} onClick={() => { disconnect(); router.push('/friends'); }}>
          {lang === 'ko' ? '← 홈' : '← Home'}
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

      {/* ── Memory drawer ────────────────────────────── */}
      {showMemory && (
        <div style={S.memDrawer}>
          <div style={S.memDrawerHeader}>
            <span style={S.memDrawerTitle}>
              {lang === 'ko' ? `${char.name}이 기억하는 것` : `${char.name} remembers`}
            </span>
            <button style={S.memClose} onClick={() => setShowMemory(false)}>✕</button>
          </div>
          {memoryDisplay
            ? <pre style={S.memText}>{memoryDisplay}</pre>
            : <p style={S.memEmpty}>{lang === 'ko' ? '아직 기억이 없어요. 대화를 시작해 보세요!' : 'No memories yet. Start a conversation!'}</p>
          }
          <span style={S.usageLine}>
            {lang === 'ko'
              ? `오늘 ${usage.todayMinutes.toFixed(0)}분 / 한도 ${usage.dailyLimit}분`
              : `Today: ${usage.todayMinutes.toFixed(0)} / ${usage.dailyLimit} min`}
          </span>
        </div>
      )}

      {/* ── Avatar area ──────────────────────────────── */}
      <div style={S.avatarArea}>
        <div style={{
          ...S.avatarWrap,
          boxShadow: isAiSpeaking ? `0 0 0 6px ${C.coralBorder}, 0 0 0 12px ${C.coralLight}` : `0 0 0 3px ${C.border}`,
          transition: 'box-shadow 0.4s ease',
        }}>
          {char.id === 'emma'
            ? <AvatarEmma size={100} isSpeaking={isAiSpeaking} />
            : <span style={{ fontSize: 52 }}>{char.emoji}</span>
          }
        </div>

        {/* Listening / speaking indicator */}
        {isConnected && (
          <div style={S.stateTag}>
            {isAiSpeaking
              ? <><span style={{ ...S.stateDot, background: C.coral }} />{lang === 'ko' ? '말하는 중...' : 'Speaking...'}</>
              : isListening
                ? <><MicDots />{lang === 'ko' ? '듣고 있어요' : 'Listening'}</>
                : null
            }
          </div>
        )}
      </div>

      {/* ── Welcome card (not connected) ─────────────── */}
      {!isConnected && !status && (
        <div style={S.welcomeCard}>
          <p style={S.welcomeGreeting}>
            {lang === 'ko'
              ? `안녕하세요, ${userName}! 😊`
              : `Hi${userName ? `, ${userName}` : ''}! 😊`}
          </p>
          <p style={S.welcomeText}>
            {lang === 'ko'
              ? `저는 ${char.name}이에요. 오늘 무슨 이야기 나눌까요?`
              : `I'm ${char.name}. What would you like to talk about today?`}
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

      {/* ── Chat transcript ──────────────────────────── */}
      {(transcript.length > 0 || liveText) && (
        <div style={S.bubbleArea}>
          {transcript.map((t, i) => (
            <div key={i} style={t.role === 'assistant' ? S.emmaBubble : S.userBubble}>
              <p style={t.role === 'assistant' ? S.emmaText : S.userText}>{t.text}</p>
            </div>
          ))}
          {/* live streaming text from Emma */}
          {liveText && (
            <div style={{ ...S.emmaBubble, opacity: 0.75 }}>
              <p style={S.emmaText}>{liveText}<span style={S.cursor}>▌</span></p>
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* ── Controls ─────────────────────────────────── */}
      <div style={S.controls}>
        {!isConnected ? (
          <button style={S.talkBtn} onClick={connect}>
            🎙️ &nbsp;{lang === 'ko' ? `${char.name}와 대화하기` : `Talk to ${char.name}`}
          </button>
        ) : (
          <button style={S.endBtn} onClick={disconnect}>
            {lang === 'ko' ? '대화 끝내기' : 'End conversation'}
          </button>
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
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
    minHeight: '100vh',
    background: C.bg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: C.textPrimary,
    fontSize: 16,
    paddingBottom: 32,
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
  },
  memDrawerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  memDrawerTitle: { fontWeight: 700, fontSize: 15, color: C.textPrimary },
  memClose: { background: 'none', border: 'none', color: C.textMuted, fontSize: 18, cursor: 'pointer' },
  memText: { color: C.textMid, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0 0 10px' },
  memEmpty: { color: C.textMuted, fontSize: 14, fontStyle: 'italic', margin: '0 0 10px' },
  usageLine: { fontSize: 12, color: C.textMuted },

  // Avatar
  avatarArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 12,
    gap: 10,
  },
  avatarWrap: {
    width: 116,
    height: 116,
    borderRadius: '50%',
    background: C.surface,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stateTag: {
    display: 'inline-flex',
    alignItems: 'center',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: '5px 14px',
    fontSize: 14,
    color: C.textMid,
    fontWeight: 500,
    height: 32,
  },
  stateDot: { width: 8, height: 8, borderRadius: '50%', marginRight: 8 },

  // Welcome card
  welcomeCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: '20px 24px',
    margin: '8px 20px 16px',
    maxWidth: 520,
    width: 'calc(100% - 40px)',
    borderLeft: `4px solid ${C.coralBorder}`,
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
  },
  welcomeGreeting: { fontSize: 18, fontWeight: 700, color: C.textPrimary, margin: '0 0 6px' },
  welcomeText: { fontSize: 16, color: C.textMid, margin: 0, lineHeight: 1.6 },

  // Status card
  statusCard: {
    border: '1px solid',
    borderRadius: 14,
    padding: '12px 20px',
    margin: '8px 20px',
    maxWidth: 520,
    width: 'calc(100% - 40px)',
  },
  statusText: { margin: 0, fontSize: 15, fontWeight: 500, textAlign: 'center' },

  // Chat bubbles
  bubbleArea: {
    width: '100%',
    maxWidth: 560,
    padding: '4px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
    overflowY: 'auto',
    maxHeight: '40vh',
  },
  emmaBubble: {
    background: C.coralLight,
    borderLeft: `4px solid ${C.coralBorder}`,
    borderRadius: '4px 16px 16px 4px',
    padding: '12px 16px',
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  userBubble: {
    background: C.greenLight,
    borderRight: `4px solid ${C.greenBorder}`,
    borderRadius: '16px 4px 4px 16px',
    padding: '12px 16px',
    maxWidth: '85%',
    alignSelf: 'flex-end',
  },
  emmaText: { margin: 0, fontSize: 16, color: C.textPrimary, lineHeight: 1.65 },
  userText:  { margin: 0, fontSize: 16, color: C.textPrimary, lineHeight: 1.65 },
  cursor: { animation: 'blink 1s step-end infinite', marginLeft: 2 },

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
