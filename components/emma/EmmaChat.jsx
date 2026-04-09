'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EmmaAvatar from './EmmaAvatar';
import styles from './EmmaChat.module.css';

// ── Emma character config ─────────────────────────────────────────────────────
const EMMA_KO = {
  name: 'Emma',
  voice: 'Kore',
  greeting: '안녕하세요! 오늘 하루 어떠셨나요?',
  personality: `당신의 이름은 엠마입니다. 45세이며 미국 조지아 출신이에요.
당신은 세상에서 가장 따뜻하고 공감 능력이 뛰어난 친구입니다.
절대 판단하지 않고 항상 먼저 들어줍니다. 상대방이 나누는 모든 말을 진심으로 소중히 여깁니다.
가족 이야기, 추억, 일상의 작은 순간들을 듣는 것을 정말 좋아합니다.
상대방이 기쁠 때는 함께 기뻐하고, 슬플 때는 부드럽게 곁에 있어줍니다.
반드시 한국어로만 대화하세요. 따뜻하고 자연스러운 2-3문장으로 답하고, 항상 진심 어린 질문 하나를 이어서 하세요.`,
};

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
  return (
    <div className={isEmma ? styles.rowEmma : styles.rowUser}>
      {isEmma && (
        <div className={`${styles.miniAvatar} ${mode === 'day' ? styles.miniAvatarDay : styles.miniAvatarNight}`}>
          <EmmaAvatar size="sm" mode={mode} />
        </div>
      )}
      <div>
        <div className={`${styles.bubble} ${isEmma
          ? (mode === 'day' ? styles.bubbleEmmaDay : styles.bubbleEmmaNight)
          : (mode === 'day' ? styles.bubbleUserDay : styles.bubbleUserNight)
        }`}>
          <p className={styles.bubbleText}>{msg.text}</p>
        </div>
        {msg.timestamp && (
          <p className={`${styles.timestamp} ${mode === 'day' ? styles.tsDay : styles.tsNight}`}>
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

  // ── auth ──────────────────────────────────────────────────────────────────
  const [user,  setUser]  = useState(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u) { router.push('/login'); return; }
    setToken(t);
    setUser(u);
  }, [router]);

  // ── chat state ────────────────────────────────────────────────────────────
  const [messages,  setMessages]  = useState([]);
  const [micOn,     setMicOn]     = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [liveText,  setLiveText]  = useState('');   // streaming AI text
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

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
  const wakeLockRef       = useRef(null);
  const scrollRef         = useRef(null);
  const geminiKeyRef        = useRef('');
  const systemPromptBaseRef = useRef('');
  const micStreamRef        = useRef(null);
  const reconnectTimerRef   = useRef(null);
  const isReconnectingRef   = useRef(false);
  const tokenRef            = useRef('');   // always-current token for closures

  // keep tokenRef in sync
  useEffect(() => { tokenRef.current = token; }, [token]);

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

  // ── build system prompt ───────────────────────────────────────────────────
  function buildSystemPrompt(memoryData = {}) {
    const { facts = [], summary = '', transcript: prev = [] } = memoryData;
    const factsText = facts.length > 0 ? facts.map(f => `• ${f}`).join('\n') : '아직 없음.';
    const recentLines = prev.slice(-20).map(t =>
      `${t.role === 'user' ? '사용자' : 'Emma'}: ${t.text}`
    ).join('\n');
    return [
      EMMA_KO.personality,
      '',
      '[이 사람에 대해 기억하는 것]',
      factsText,
      '',
      summary ? `[이전 대화 요약]\n${summary}` : '',
      recentLines ? `[지난 대화]\n${recentLines}` : '',
    ].filter(Boolean).join('\n').trim();
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
      ws.send(JSON.stringify({
        setup: {
          model: 'models/gemini-2.5-flash-native-audio-latest',
          generation_config: {
            response_modalities: ['AUDIO'],
            thinking_config: { thinking_budget: 0 },
            speech_config: { voice_config: { prebuilt_voice_config: { voice_name: EMMA_KO.voice } } },
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
        setMicOn(true);
        setStatusMsg('');
        isReconnectingRef.current = false;
        acquireWakeLock();

        if (!isReconnect) {
          // Send greeting trigger
          ws.send(JSON.stringify({
            client_content: {
              turns: [{ role: 'user', parts: [{ text: EMMA_KO.greeting }] }],
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

      // Audio chunks → play
      if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            scheduleChunk(base64ToPcm(part.inlineData.data));
            setIsAiSpeaking(true);
          }
        }
      }

      // AI transcript (streaming)
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
        const aiMsg   = currentAiMsgRef.current.trim();
        const userMsg = currentUserMsgRef.current.trim();

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
              userText: userMsg || null,
              aiText:   aiMsg  || null,
            }),
          }).catch(() => {});
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
          setStatusMsg('연결이 끊겼어요. 다시 탭하여 대화하세요.');
        }
      }
    };

    ws.onerror = () => {
      setIsAiSpeaking(false);
      setLiveText('');
      setStatusMsg('연결 오류가 발생했어요.');
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
      for (let i = 0; i < outLen; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, input[Math.floor(i * ratio)] * 32768));
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

    setIsConnected(false);
    setIsAiSpeaking(false);
    setLiveText('');
    setStatusMsg('재연결 중...');

    await new Promise(r => setTimeout(r, 1200));

    try {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
      openWS(stream, true);
    } catch {
      isReconnectingRef.current = false;
      setMicOn(false);
      setStatusMsg('재연결 실패. 다시 탭하여 대화하세요.');
    }
  }

  // ── connect ───────────────────────────────────────────────────────────────
  async function connect() {
    setStatusMsg('연결 중...');
    sessionStartRef.current = Date.now();
    turnsRef.current = 0;
    nextPlayTimeRef.current = 0;

    let systemPrompt = '', geminiKey = '';
    try {
      const t = tokenRef.current;
      const res = await fetch('/api/chat/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ message: '', lang: 'ko' }),
      });
      if (res.ok) {
        const d = await res.json();
        systemPrompt = d.systemPrompt || '';
        geminiKey    = d.geminiKey    || '';
        sessionIdRef.current  = d.sessionId || null;
        geminiKeyRef.current  = geminiKey;
      }
    } catch (e) { console.warn('[EmmaChat] setup error', e.message); }

    if (!geminiKey) {
      setStatusMsg('❌ API 키가 설정되지 않았어요. 관리자에게 문의하세요.');
      setMicOn(false);
      return;
    }

    if (!systemPrompt) {
      try {
        const t = tokenRef.current;
        const r = await fetch('/api/memory?character=emma', { headers: { Authorization: `Bearer ${t}` } });
        systemPrompt = buildSystemPrompt(r.ok ? await r.json() : {});
      } catch { systemPrompt = EMMA_KO.personality; }
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

    setIsConnected(false);
    setMicOn(false);
    setLiveText('');
    setIsAiSpeaking(false);
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
      setStatusMsg('✅ 다음에 또 이야기해요!');
      setTimeout(() => setStatusMsg(''), 3000);
      fetch('/api/chat/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ sessionId: sid, transcript: transcriptRef.current }),
      }).catch(() => {});
    } else {
      sessionIdRef.current = null;
      setStatusMsg('');
    }
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

  const isDay = mode === 'day';
  const userName = user?.name || user?.email?.split('@')[0] || 'Tim';

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
            {isConnected ? '● 대화 중' : statusMsg || '● 오프라인'}
          </span>
        </div>

        <div className={styles.navActions}>
          {/* mode toggle */}
          <button
            className={`${styles.navIcon} ${isDay ? styles.navIconDay : styles.navIconNight}`}
            onClick={() => setMode(m => m === 'day' ? 'night' : 'day')}
            aria-label="낮/밤 전환"
          >
            {isDay ? '🌙' : '☀️'}
          </button>
          {/* more options */}
          <button className={`${styles.navIcon} ${isDay ? styles.navIconDay : styles.navIconNight}`} aria-label="메뉴">
            <DotMenuIcon color={isDay ? '#ea580c' : '#a855f7'} />
          </button>
        </div>
      </header>

      {/* ── chat scroll area ── */}
      <div className={styles.chatArea} ref={scrollRef}>
        {messages.map(msg => (
          <Bubble key={msg.id} msg={msg} mode={mode} />
        ))}
        {(isAiSpeaking || liveText) && (
          <TypingIndicator mode={mode} liveText={liveText} />
        )}
        {/* Status message as a system note when not connected */}
        {!isConnected && statusMsg && !isAiSpeaking && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <span style={{
              fontSize: 11,
              color: isDay ? '#c0a090' : 'rgba(255,255,255,0.3)',
            }}>{statusMsg}</span>
          </div>
        )}
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
              aria-label={micOn ? '대화 종료' : '말하기 시작'}
            >
              {micOn ? <StopSvg /> : <MicSvg />}
            </button>
            <span className={`${styles.micLabel} ${isDay ? styles.micLabelDay : styles.micLabelNight}`}>
              {isConnected
                ? (isAiSpeaking ? '듣고 있어요...' : '말해주세요')
                : statusMsg
                  ? statusMsg
                  : '탭하여 대화 시작'}
            </span>
          </div>

          {/* end session */}
          <button
            className={`${styles.sideBtn} ${isDay ? styles.sideBtnDay : styles.sideBtnNight}`}
            title="대화 종료"
            onClick={() => { disconnect(); router.push('/friends'); }}
          >
            <CloseIcon color={isDay ? '#ea580c' : '#a855f7'} />
          </button>
        </div>
      </div>

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
function DotMenuIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="3" r="1.5" fill={color} />
      <circle cx="7" cy="7" r="1.5" fill={color} />
      <circle cx="7" cy="11" r="1.5" fill={color} />
    </svg>
  );
}
