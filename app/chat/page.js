'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CHARACTERS, getCharacterLocale } from '@/lib/characters';
import AvatarEmma from '@/components/avatars/AvatarEmma';

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams.get('character') || 'emma';
  const baseLang = typeof window !== 'undefined'
    ? (localStorage.getItem('lang') || 'en') : 'en';
  const [lang, setLang] = useState(baseLang);
  const char = getCharacterLocale(CHARACTERS[characterId] || CHARACTERS.emma, lang);

  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const sessionStartRef = useRef(null);
  const turnsRef = useRef(0);
  const gradientIdxRef = useRef(0);
  const gradientTimerRef = useRef(null);
  const transcriptRef = useRef([]);
  const sessionIdRef = useRef(null);
  const currentUserMsgRef = useRef('');
  const currentAiMsgRef = useRef('');
  const wakeLockRef = useRef(null);

  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [currentText, setCurrentText] = useState('');
  const [bgGradient, setBgGradient] = useState('');
  const [usage, setUsage] = useState({ todayMinutes: 0, dailyLimit: 30, canChat: true });
  const [transcript, setTranscript] = useState([]);
  const [showMemory, setShowMemory] = useState(false);
  const [memoryDisplay, setMemoryDisplay] = useState('No memories yet.');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  function toggleLang() {
    const next = lang === 'en' ? 'ko' : 'en';
    setLang(next);
    localStorage.setItem('lang', next);
  }

  // ── Screen Wake Lock ─────────────────────────────────────────
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return; // not supported
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Screen lock prevented ✅');
      // If the lock is released (e.g. tab hidden then visible), re-acquire
      wakeLockRef.current.addEventListener('release', () => {
        console.log('[WakeLock] Released by system');
      });
    } catch (e) {
      console.warn('[WakeLock] Could not acquire:', e.message);
    }
  }

  function releaseWakeLock() {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      console.log('[WakeLock] Released ✅');
    }
  }

  // Re-acquire wake lock when user returns to the tab while connected
  useEffect(() => {
    async function onVisibilityChange() {
      if (document.visibilityState === 'visible' && isConnected) {
        await acquireWakeLock();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isConnected]);
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u) { router.push('/login'); return; }
    setToken(t);
    setUser(u);
    fetchUsage(t);
    fetchMemory(t);
  }, [router]);

  // Slowly cycle background gradient
  useEffect(() => {
    setBgGradient(`135deg, ${char.colors.gradients[0]}`);
    function cycle() {
      gradientIdxRef.current = (gradientIdxRef.current + 1) % char.colors.gradients.length;
      setBgGradient(`135deg, ${char.colors.gradients[gradientIdxRef.current]}`);
    }
    gradientTimerRef.current = setInterval(cycle, 4000);
    return () => clearInterval(gradientTimerRef.current);
  }, [char]);

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
      setMemoryDisplay(facts.length > 0 ? facts.map(f => `• ${f}`).join('\n') : 'No memories yet.');
    } catch {}
  }

  function buildSystemPrompt(memory) {
    const { facts = [], summary = '', transcript: prevTranscript = [] } = memory;
    const factsText = facts.length > 0 ? facts.map(f => `• ${f}`).join('\n') : 'Nothing yet.';

    const recentLines = prevTranscript.slice(-20)
      .map(t => `${t.role === 'user' ? 'User' : char.name}: ${t.text}`)
      .join('\n');

    return `${char.personality}

[What you remember about this person]
${factsText}

[Summary of your previous conversations]
${summary || 'This is your first conversation with this person.'}

${recentLines ? `[How your last conversation ended]\n${recentLines}` : ''}`.trim();
  }

  async function connect() {
    if (!usage.canChat) {
      setStatus("You've reached today's limit. Come back tomorrow!");
      return;
    }
    setStatus('Connecting...');
    sessionStartRef.current = Date.now();
    turnsRef.current = 0;

    // Fetch memory-enriched system prompt + server API key (for WebSocket auth)
    let systemPrompt = '';
    let geminiKey = '';
    try {
      const setupRes = await fetch('/api/chat/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: '', lang }),
      });
      if (setupRes.ok) {
        const setupData = await setupRes.json();
        systemPrompt = setupData.systemPrompt || '';
        geminiKey = setupData.geminiKey || '';
        sessionIdRef.current = setupData.sessionId || null;
        console.log('[Memory] Session started. sessionId:', setupData.sessionId, 'debug:', setupData.debugInfo);
      }
    } catch (e) {
      console.warn('[Memory] setup failed:', e.message);
    }

    if (!geminiKey) {
      setStatus('❌ Server API key not configured. Contact admin.');
      return;
    }

    // Fallback system prompt if memory engine failed
    if (!systemPrompt) {
      let memory = { facts: [], summary: '' };
      try {
        const res = await fetch(`/api/memory?character=${characterId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) memory = await res.json();
      } catch {}
      systemPrompt = buildSystemPrompt(memory);
    }

    try {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        const ws = new WebSocket(
          `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${geminiKey}`
        );
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('🔌 Connected, setting up...');
          ws.send(JSON.stringify({
            setup: {
              model: 'models/gemini-2.5-flash-native-audio-latest',
              generation_config: {
                response_modalities: ['AUDIO'],
                thinking_config: { thinking_budget: 0 },
                speech_config: {
                  voice_config: {
                    prebuilt_voice_config: { voice_name: char.voice },
                  },
                },
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
          const preview = raw.replace(/"data":"[^"]{0,20}[^"]*"/g, '"data":"..."');
          if (!raw.includes('"inlineData"')) console.log('[MSG]', preview.slice(0, 300));

          if (msg.setupComplete) {
            setIsConnected(true);
            setStatus('');
            setCurrentText(lang === 'ko' ? '듣고 있어요...' : 'Listening...');
            acquireWakeLock(); // prevent screen from sleeping during conversation
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
                const pcm = base64ToPcm(part.inlineData.data);
                audioQueueRef.current.push(pcm);
                setIsAiSpeaking(true);
                playNext();
              }
            }
          }

          const aiTranscript = msg.serverContent?.outputTranscription?.text
                            ?? msg.outputTranscription?.text;
          if (aiTranscript) {
            currentAiMsgRef.current += aiTranscript;
            setCurrentText(prev => {
              const base = prev === 'Listening...' ? '' : prev;
              return base ? base + ' ' + aiTranscript : aiTranscript;
            });
            setTranscript(prev => {
              const last = prev[prev.length - 1];
              const next = last?.role === 'assistant'
                ? [...prev.slice(0, -1), { role: 'assistant', text: last.text + aiTranscript }]
                : [...prev, { role: 'assistant', text: aiTranscript }];
              transcriptRef.current = next;
              return next;
            });
          }

          const userTranscript = msg.serverContent?.inputTranscription?.text
                              ?? msg.inputTranscription?.text;
          if (userTranscript) {
            currentUserMsgRef.current += userTranscript;
            setTranscript(prev => {
              const last = prev[prev.length - 1];
              const next = last?.role === 'user'
                ? [...prev.slice(0, -1), { role: 'user', text: last.text + userTranscript }]
                : [...prev, { role: 'user', text: userTranscript }];
              transcriptRef.current = next;
              return next;
            });
          }

          if (msg.serverContent?.turnComplete) {
            const turnNum = ++turnsRef.current;
            const userMsg = currentUserMsgRef.current.trim();
            currentUserMsgRef.current = '';
            currentAiMsgRef.current = '';

            setCurrentText('');
            setIsAiSpeaking(false);

            // Fire-and-forget: save emotion turn to server (key is server-side)
            if (userMsg && sessionIdRef.current) {
              fetch('/api/chat/turn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  sessionId: sessionIdRef.current,
                  turnNumber: turnNum,
                  userMessage: userMsg,
                }),
              }).catch(() => {});
            }

          }
        };

        ws.onclose = (evt) => {
          setIsConnected(false);
          stopMic();
          if (wsRef.current !== null) {
            setStatus(`❌ ${evt.reason || `code ${evt.code}`}`);
          }
        };
        ws.onerror = () => setStatus('❌ Connection error. Check console.');

        // Mic setup
        const micSource = audioCtxRef.current.createMediaStreamSource(stream);
        const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== 1) return;
          const f32 = e.inputBuffer.getChannelData(0);
          const i16 = new Int16Array(f32.length);
          for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
          const b64 = btoa(String.fromCharCode(...new Uint8Array(i16.buffer)));
          ws.send(JSON.stringify({ realtime_input: { media_chunks: [{ mime_type: 'audio/pcm;rate=16000', data: b64 }] } }));
        };
        micSource.connect(processor);
        processor.connect(audioCtxRef.current.destination);
        processorRef.current = processor;
        sourceRef.current = micSource;
      });
    } catch (e) {
      setStatus(`Error: ${e.message}`);
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

  function playNext() {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    isPlayingRef.current = true;
    const f32 = audioQueueRef.current.shift();
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => { isPlayingRef.current = false; playNext(); };
    src.start();
  }

  function stopMic() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
  }

  async function disconnect(saveMemory = false) {
    wsRef.current?.close();
    wsRef.current = null;
    stopMic();
    setIsConnected(false);
    setCurrentText('');
    setIsAiSpeaking(false);
    releaseWakeLock(); // allow screen to sleep again

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
      // Fire-and-forget: don't block UI on memory extraction
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      setStatus('✅ See you next time!');

      fetch('/api/chat/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: sid, transcript }),
      })
        .then(r => r.ok ? r.json() : {})
        .then(data => {
          const count = data.memoriesExtracted || 0;
          if (count > 0) {
            fetchMemory(token);
            console.log(`[Memory] ${count} memories saved in background.`);
          }
        })
        .catch(() => {});
    } else {
      sessionIdRef.current = null;
      setStatus('');
    }
  }

  if (!user) return <div style={{ background: '#080b14', minHeight: '100vh' }} />;

  return (
    <div style={{
      ...S.page,
      background: bgGradient ? `linear-gradient(${bgGradient})` : '#080b14',
      transition: 'background 3s ease',
    }}>

      {/* Top bar */}
      <div style={S.topBar}>
        <div style={S.topLeft}>
          <button style={S.backBtn} onClick={() => { disconnect(false); router.push('/friends'); }}>
            ← Friends
          </button>
          <div style={{ ...S.dot, background: isConnected ? '#10b981' : '#475569' }} />
          <span style={{ ...S.charLabel, color: char.colors.accent }}>{char.emoji} {char.name}</span>
        </div>
        <div style={S.topRight}>
          <span style={S.usageBadge}>{usage.todayMinutes.toFixed(0)}/{usage.dailyLimit} min</span>
          <button
            style={{ ...S.iconBtn, fontWeight: 700, letterSpacing: '0.05em', minWidth: 52 }}
            onClick={toggleLang}
            title="Switch language"
            disabled={isConnected}
          >
            {lang === 'en' ? '🇺🇸 EN' : '🇰🇷 한'}
          </button>
          <button style={S.iconBtn} onClick={() => setShowMemory(m => !m)} title="Memory">🧠</button>
        </div>
      </div>

      {/* Memory panel */}
      {showMemory && (
        <div style={S.memPanel}>
          <div style={S.memHeader}>
            <span>🧠 {char.name} remembers</span>
            <button style={S.memClose} onClick={() => setShowMemory(false)}>✕</button>
          </div>
          <pre style={S.memText}>{memoryDisplay}</pre>
          <button style={S.clearBtn} onClick={async () => {
            await fetch(`/api/memory?character=${characterId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            setMemoryDisplay('No memories yet.');
          }}>Clear {char.name}'s memory</button>
        </div>
      )}

      {/* Main display */}
      <div style={S.textArea}>

        {/* Avatar — always visible for Emma, emoji circle for others */}
        <div style={{
          display: 'flex', justifyContent: 'center', marginBottom: 8,
          filter: isConnected ? `drop-shadow(0 0 24px ${char.colors.glow}66)` : `drop-shadow(0 0 8px ${char.colors.glow}22)`,
          transition: 'filter 0.5s ease',
        }}>
          {char.id === 'emma' ? (
            <AvatarEmma size={isConnected ? 160 : 140} isSpeaking={isAiSpeaking} />
          ) : (
            <div style={{
              width: isConnected ? 130 : 110,
              height: isConnected ? 130 : 110,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.3)',
              border: `2px solid ${char.colors.accent}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: isConnected ? 58 : 48,
              transition: 'all 0.5s ease',
            }}>
              {char.emoji}
            </div>
          )}
        </div>

        {/* Name + role — only when not connected */}
        {!isConnected && !status && (
          <div style={S.introWrap}>
            <div style={{ ...S.introName, color: char.colors.accent }}>{char.name}</div>
            <div style={S.introRole}>{char.role}</div>
            <div style={S.introTagline}>"{char.tagline}"</div>
          </div>
        )}

        {status && (
          <p style={S.statusText}>{status}</p>
        )}

        {isConnected && currentText && (
          <p style={{
            ...S.mainText,
            textShadow: `0 0 40px ${char.colors.accent}60`,
          }}>
            {currentText}
          </p>
        )}
      </div>

      {/* Pulse ring when connected */}
      {isConnected && (
        <div style={S.pulseWrap}>
          <div style={{ ...S.pulseRing, borderColor: char.colors.accent }} />
          <div style={{ ...S.pulseDot, background: char.colors.accent }} />
        </div>
      )}

      {/* Controls */}
      <div style={S.controls}>
        {!isConnected ? (
          <button
            style={{
              ...S.bigBtn,
              background: `linear-gradient(135deg, ${char.colors.accent}cc, ${char.colors.accent})`,
              boxShadow: `0 4px 24px ${char.colors.glow}44`,
            }}
            onClick={connect}
          >
            💬 &nbsp;Talk to {char.name}
          </button>
        ) : (
          <div style={S.btnRow}>
            <button style={S.endBtn} onClick={() => disconnect(false)}>✕ End</button>
            <button
              style={{
                ...S.saveBtn,
                background: `linear-gradient(135deg, ${char.colors.accent}cc, ${char.colors.accent})`,
                boxShadow: `0 4px 16px ${char.colors.glow}44`,
              }}
              onClick={() => disconnect(true)}
            >
              💾 Save &amp; End
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ background: '#080b14', minHeight: '100vh' }} />}>
      <ChatPageInner />
    </Suspense>
  );
}

const S = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  topBar: {
    width: '100%',
    maxWidth: 600,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
  },
  topLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  backBtn: {
    background: 'rgba(255,255,255,0.08)',
    color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
  dot: { width: 8, height: 8, borderRadius: '50%' },
  charLabel: { fontWeight: 700, fontSize: 16 },
  topRight: { display: 'flex', alignItems: 'center', gap: 8 },
  usageBadge: {
    background: 'rgba(255,255,255,0.08)',
    color: '#94a3b8',
    borderRadius: 20,
    padding: '4px 10px',
    fontSize: 12,
  },
  iconBtn: {
    background: 'rgba(255,255,255,0.08)',
    color: '#e2e8f0',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 14,
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
  },

  memPanel: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 280,
    background: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: 16,
    padding: 16,
    zIndex: 20,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  memHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: 600,
  },
  memClose: { background: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', border: 'none' },
  memText: { color: '#94a3b8', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit', marginBottom: 10 },
  clearBtn: {
    background: 'rgba(239,68,68,0.15)',
    color: '#fca5a5',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    border: '1px solid rgba(239,68,68,0.2)',
    width: '100%',
    cursor: 'pointer',
  },

  textArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 32px',
    width: '100%',
    maxWidth: 680,
    textAlign: 'center',
    minHeight: '50vh',
  },

  introWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  introEmoji: {
    width: 100,
    height: 100,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 48,
    marginBottom: 8,
  },
  introName: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  introRole: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: 500,
  },
  introTagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
    marginTop: 4,
  },

  statusText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 22,
    fontWeight: 300,
  },
  mainText: {
    fontSize: 'clamp(26px, 5vw, 44px)',
    fontWeight: 500,
    lineHeight: 1.4,
    color: '#ffffff',
    letterSpacing: '-0.01em',
    transition: 'color 0.4s ease',
  },

  pulseWrap: {
    position: 'relative',
    width: 72,
    height: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  pulseRing: {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: '2px solid',
    animation: 'pulse 2s ease-in-out infinite',
  },
  pulseDot: { width: 20, height: 20, borderRadius: '50%', opacity: 0.9 },

  controls: { padding: '0 20px 40px', width: '100%', maxWidth: 500 },
  bigBtn: {
    width: '100%',
    padding: '20px',
    color: '#fff',
    borderRadius: 18,
    fontSize: 20,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
  },
  btnRow: { display: 'flex', gap: 12 },
  endBtn: {
    flex: 1,
    padding: '18px',
    background: 'rgba(239,68,68,0.15)',
    color: '#fca5a5',
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 600,
    border: '1px solid rgba(239,68,68,0.25)',
    cursor: 'pointer',
  },
  saveBtn: {
    flex: 2,
    padding: '18px',
    color: '#fff',
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  },
};

