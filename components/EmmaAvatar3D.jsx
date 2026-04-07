'use client';
import { useEffect, useRef, useState } from 'react';
import AvatarEmma from '@/components/avatars/AvatarEmma';

// Placeholder — replace with /avatars/emma.glb once custom Emma model is ready
const AVATAR_URL = '/avatars/avaturn.glb';
const TALKINGHEAD_URL = 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7/modules/talkinghead.mjs';

// Valence/arousal → TalkingHead mood
function emotionToMood(emotionData) {
  if (!emotionData) return 'neutral';
  const { valence = 0, arousal = 0.5 } = emotionData;
  if (valence > 0.5)              return 'happy';
  if (valence > 0.2)              return 'friendly';
  if (valence < -0.3)             return 'sad';
  if (valence < -0.1)             return 'concerned';
  if (arousal > 0.7)              return 'happy';
  return 'neutral';
}

export default function EmmaAvatar3D({
  isSpeaking = false,
  isListening = false,
  emotionData = null,
  onReady,
}) {
  const containerRef = useRef(null);
  const headRef      = useRef(null);
  const [mode, setMode]   = useState('loading'); // 'loading' | '3d' | 'fallback'

  // ── Initialize TalkingHead ──────────────────────────────────
  useEffect(() => {
    let head = null;
    let cancelled = false;

    async function init() {
      try {
        const { TalkingHead } = await import(/* webpackIgnore: true */ TALKINGHEAD_URL);
        if (cancelled) return;

        head = new TalkingHead(containerRef.current, {
          ttsEndpoint:          null,   // audio handled by Gemini
          cameraView:           'upper',
          cameraRotateEnable:   false,
          cameraZoomEnable:     false,
          cameraPanEnable:      false,
          avatarMood:           'neutral',
          avatarMute:           true,
          modelPixelRatio:      window.devicePixelRatio > 1 ? 1.5 : 1,
          modelFPS:             30,
        });

        // Force Three.js GLTFLoader to use TextureLoader (<img>) instead of
        // ImageBitmapLoader (fetch). TextureLoader loads blob: URLs natively
        // via image element which doesn't go through service workers or Puppeteer
        // security restrictions. Restored after avatar textures finish loading.
        const origCIB = window.createImageBitmap;
        window.createImageBitmap = undefined;
        try {
          await head.showAvatar({
            url:          AVATAR_URL,
            body:         'F',
            avatarMood:   'neutral',
            idleMotion:   'listening',
          });
        } finally {
          window.createImageBitmap = origCIB;
        }

        if (cancelled) { head.dispose(); return; }

        headRef.current = head;
        setMode('3d');
        head.playGesture('wave');
        if (onReady) onReady(head);
      } catch (e) {
        console.warn('[EmmaAvatar3D] TalkingHead failed, using 2D fallback:', e.message);
        if (!cancelled) setMode('fallback');
      }
    }

    init();
    return () => {
      cancelled = true;
      if (head) { try { head.dispose(); } catch {} }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update mood when speaking / listening ───────────────────
  useEffect(() => {
    if (!headRef.current || mode !== '3d') return;
    if (isSpeaking)       headRef.current.setMood('friendly');
    else if (isListening) headRef.current.setMood('neutral');
  }, [isSpeaking, isListening, mode]);

  // ── Update mood from emotion data ───────────────────────────
  useEffect(() => {
    if (!headRef.current || mode !== '3d' || !emotionData) return;
    const mood = emotionToMood(emotionData);
    headRef.current.setMood(mood);
    if (emotionData.arousal > 0.7) {
      try { headRef.current.playGesture('nod'); } catch {}
    }
  }, [emotionData, mode]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#FFFCF8' }}>

      {/* 3D canvas container — always mounted so TalkingHead can attach */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: mode === '3d' ? 'block' : 'none',
        }}
      />

      {/* Loading state */}
      {mode === 'loading' && (
        <div style={styles.center}>
          <div style={styles.loadingCircle}>E</div>
          <p style={styles.loadingText}>Emma is getting ready…</p>
          <div style={styles.loadingDots}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{ ...styles.dot, animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* 2D CSS fallback */}
      {mode === 'fallback' && (
        <div style={styles.center}>
          <div style={{
            width: 140, height: 140,
            borderRadius: '50%',
            background: '#FFF3EC',
            border: '3px solid #FDBA74',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isSpeaking
              ? '0 0 0 8px #FDBA7444, 0 0 0 16px #FFF3EC'
              : '0 4px 20px rgba(0,0,0,0.08)',
            transition: 'box-shadow 0.4s ease',
          }}>
            <AvatarEmma size={120} isSpeaking={isSpeaking} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes avatarBounce {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  center: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 12,
  },
  loadingCircle: {
    width: 80, height: 80, borderRadius: '50%',
    background: '#FDBA74',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 36, fontWeight: 700, color: '#fff',
    boxShadow: '0 4px 20px rgba(249,115,22,0.3)',
  },
  loadingText: {
    fontSize: 15, color: '#78716C', margin: 0,
  },
  loadingDots: {
    display: 'flex', gap: 6, alignItems: 'center',
  },
  dot: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#FDBA74', display: 'inline-block',
    animation: 'avatarBounce 1.2s ease-in-out infinite',
  },
};
