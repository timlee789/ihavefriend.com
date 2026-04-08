'use client';
import { useEffect, useRef, useState } from 'react';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─────────────────────────────────────────────────────────────────────────────
// EmmaAvatar — polished CSS 2-D character
// Props: isSpeaking, isListening, subtitle
// ─────────────────────────────────────────────────────────────────────────────
export default function EmmaAvatar({ isSpeaking = false, isListening = false, subtitle = '' }) {
  const containerRef = useRef(null);
  const [s, setS]          = useState(1);        // scale factor
  const [eyeOff, setEyeOff] = useState({ x: 0, y: 0 });
  const [blinking, setBlinking] = useState(false);

  // ── Measure container → derive scale ──
  useEffect(() => {
    const BASE_W = 340, BASE_H = 490;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setS(Math.min(width / BASE_W, height / BASE_H));
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Smooth eye tracking via rAF lerp ──
  useEffect(() => {
    const target = { x: 0, y: 0 };
    let cur = { x: 0, y: 0 };
    let raf;

    const onMove = (e) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const eyeCX = r.left + r.width  * 0.5;
      const eyeCY = r.top  + r.height * 0.33;
      const px = e.touches ? e.touches[0].clientX : e.clientX;
      const py = e.touches ? e.touches[0].clientY : e.clientY;
      target.x = clamp((px - eyeCX) / (r.width  * 0.38), -1, 1) * 4.5;
      target.y = clamp((py - eyeCY) / (r.height * 0.28), -1, 1) * 3.0;
    };

    const loop = () => {
      cur.x += (target.x - cur.x) * 0.07;
      cur.y += (target.y - cur.y) * 0.07;
      setEyeOff({ x: +cur.x.toFixed(2), y: +cur.y.toFixed(2) });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // ── Natural blink (single + occasional double) ──
  useEffect(() => {
    let t;
    const blink = () => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 115);
    };
    const sched = () => {
      t = setTimeout(() => {
        blink();
        if (Math.random() < 0.22) setTimeout(blink, 260);
        sched();
      }, 2600 + Math.random() * 3400);
    };
    sched();
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={containerRef} style={{
      position: 'relative', width: '100%', height: '100%',
      overflow: 'hidden',
      background: 'linear-gradient(170deg, #FFF6EC 0%, #FEEBD6 45%, #F8D9BA 100%)',
    }}>

      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes emmaBreath    { 0%,100%{transform:translateY(0)} 45%{transform:translateY(-4px)} }
        @keyframes emmaHairShine { 0%,100%{opacity:0.18} 50%{opacity:0.42} }
        @keyframes emmaTalk      { 0%,100%{transform:scaleY(0.22)} 40%{transform:scaleY(0.80)} }
        @keyframes emmaGlow      { 0%,100%{opacity:0.55;transform:scale(1)} 50%{opacity:0.2;transform:scale(1.15)} }
        @keyframes emmaFloat     { 0%,100%{transform:translateX(-50%) translateY(0)} 45%{transform:translateX(-50%) translateY(-5px)} }
      `}</style>

      {/* ── Warm background glow ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 55% at 50% 30%, rgba(255,200,140,0.38) 0%, transparent 100%)',
      }} />

      {/* ── Listening pulse ring ── */}
      {isListening && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 0,
          width: s * 280, height: s * 280,
          marginLeft: -(s * 140),
          borderRadius: '50%',
          border: `${s * 2.5}px solid rgba(17,153,142,0.4)`,
          animation: 'emmaGlow 1.3s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 1,
        }} />
      )}

      {/* ── Character body (floats up on breath) ── */}
      <div style={{
        position: 'absolute', left: '50%', bottom: 0,
        width: s * 340, height: s * 490,
        animation: 'emmaFloat 4.2s ease-in-out infinite',
        zIndex: 2,
      }}>
        {/* ══ HAIR — back mass ══ */}
        <div style={{
          position: 'absolute', zIndex: 1,
          width: s * 208, height: s * 168,
          background: 'radial-gradient(ellipse at 48% 30%, #d05830 0%, #982010 55%, #6e1608 100%)',
          borderRadius: '50% 50% 38% 38%',
          top: s * 6, left: s * 66,
        }} />

        {/* Hair left side flow */}
        <div style={{
          position: 'absolute', zIndex: 1,
          width: s * 46, height: s * 215,
          background: 'linear-gradient(178deg, #b03818 0%, #7a2008 50%, #541408 100%)',
          borderRadius: '28% 18% 58% 42% / 8% 14% 44% 56%',
          top: s * 50, left: s * 42,
        }} />

        {/* Hair right side flow */}
        <div style={{
          position: 'absolute', zIndex: 1,
          width: s * 46, height: s * 215,
          background: 'linear-gradient(182deg, #b03818 0%, #7a2008 50%, #541408 100%)',
          borderRadius: '18% 28% 42% 58% / 14% 8% 56% 44%',
          top: s * 50, right: s * 42,
        }} />

        {/* Hair bottom back */}
        <div style={{
          position: 'absolute', zIndex: 1,
          width: s * 252, height: s * 135,
          background: 'linear-gradient(180deg, #7a2008 0%, #501006 100%)',
          borderRadius: '28% 28% 50% 50%',
          bottom: s * 55, left: s * 44,
        }} />

        {/* Hair highlight shimmer */}
        <div style={{
          position: 'absolute', zIndex: 1,
          width: s * 60, height: s * 50,
          background: 'rgba(230,120,70,0.28)',
          borderRadius: '50%',
          top: s * 14, left: s * 128,
          filter: `blur(${s * 10}px)`,
          animation: 'emmaHairShine 3.4s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* ══ FACE oval ══ */}
        <div style={{
          position: 'absolute', zIndex: 2,
          width: s * 184, height: s * 218,
          background: 'linear-gradient(155deg, #f9ccaa 0%, #ecab7e 52%, #de9460 100%)',
          borderRadius: '48% 48% 44% 44%',
          top: s * 46, left: s * 78,
          boxShadow: [
            `inset -${s*6}px ${s*8}px ${s*20}px rgba(0,0,0,0.07)`,
            `inset ${s*4}px -${s*4}px ${s*12}px rgba(255,215,175,0.22)`,
            `0 ${s*4}px ${s*18}px rgba(160,70,20,0.12)`,
          ].join(','),
        }} />

        {/* ══ EARS ══ */}
        <div style={{ position:'absolute', zIndex:2, width:s*18, height:s*26,
          background:'linear-gradient(135deg,#eaaa7a,#d8906a)', borderRadius:'50%',
          top:s*148, left:s*70, boxShadow:`inset ${s*2}px 0 ${s*4}px rgba(0,0,0,0.1)` }} />
        <div style={{ position:'absolute', zIndex:2, width:s*18, height:s*26,
          background:'linear-gradient(225deg,#eaaa7a,#d8906a)', borderRadius:'50%',
          top:s*148, right:s*70, boxShadow:`inset -${s*2}px 0 ${s*4}px rgba(0,0,0,0.1)` }} />

        {/* ══ HAIR FRONT (over ears) ══ */}
        <div style={{
          position: 'absolute', zIndex: 3,
          width: s * 174, height: s * 56,
          background: 'linear-gradient(180deg, #c04020 0%, #8e2a0e 100%)',
          borderRadius: '50% 50% 32% 32%',
          top: s * 40, left: s * 83,
          boxShadow: `inset 0 -${s*3}px ${s*8}px rgba(0,0,0,0.18)`,
        }} />

        {/* ══ CHEEK BLUSH ══ */}
        <div style={{ position:'absolute', zIndex:4, width:s*46, height:s*22,
          background:'rgba(240,110,90,0.18)', borderRadius:'50%',
          top:s*194, left:s*86, filter:`blur(${s*6}px)` }} />
        <div style={{ position:'absolute', zIndex:4, width:s*46, height:s*22,
          background:'rgba(240,110,90,0.18)', borderRadius:'50%',
          top:s*194, right:s*86, filter:`blur(${s*6}px)` }} />

        {/* ══ EYEBROWS ══ */}
        {/* Left */}
        <div style={{
          position: 'absolute', zIndex: 5,
          width: s * 50, height: s * 7,
          background: 'linear-gradient(90deg, rgba(80,20,4,0.85), rgba(120,40,16,0.9), rgba(80,20,4,0.7))',
          borderRadius: '6px 8px 3px 3px',
          top: s * 118, left: s * 90,
          transform: 'rotate(-9deg)',
          filter: `blur(${s * 0.5}px)`,
        }} />
        {/* Right */}
        <div style={{
          position: 'absolute', zIndex: 5,
          width: s * 50, height: s * 7,
          background: 'linear-gradient(270deg, rgba(80,20,4,0.85), rgba(120,40,16,0.9), rgba(80,20,4,0.7))',
          borderRadius: '8px 6px 3px 3px',
          top: s * 118, right: s * 90,
          transform: 'rotate(9deg)',
          filter: `blur(${s * 0.5}px)`,
        }} />

        {/* ══ EYES ══ */}
        <Eye s={s} left={s * 86}  top={s * 132} eyeOff={eyeOff} blinking={blinking} />
        <Eye s={s} left={s * 192} top={s * 132} eyeOff={eyeOff} blinking={blinking} />

        {/* ══ NOSE ══ */}
        {/* Bridge shadow */}
        <div style={{ position:'absolute', zIndex:5, width:s*5, height:s*16,
          background:'rgba(185,88,38,0.09)', borderRadius:s*3,
          top:s*186, left:s*167 }} />
        {/* Left nostril */}
        <div style={{ position:'absolute', zIndex:5, width:s*10, height:s*6,
          background:'rgba(160,68,30,0.22)', borderRadius:'50%',
          top:s*200, left:s*148 }} />
        {/* Right nostril */}
        <div style={{ position:'absolute', zIndex:5, width:s*10, height:s*6,
          background:'rgba(160,68,30,0.22)', borderRadius:'50%',
          top:s*200, right:s*148 }} />

        {/* ══ MOUTH ══ */}
        <Mouth s={s} top={s * 222} left={s * 122} isSpeaking={isSpeaking} />

        {/* ══ NECK ══ */}
        <div style={{
          position: 'absolute', zIndex: 2,
          width: s * 58, height: s * 52,
          background: 'linear-gradient(170deg, #e8a87c, #d49060)',
          top: s * 258, left: s * 141,
          boxShadow: `inset ${s*3}px 0 ${s*8}px rgba(0,0,0,0.07), inset -${s*3}px 0 ${s*8}px rgba(0,0,0,0.07)`,
        }} />

        {/* ══ SWEATER body ══ */}
        <div style={{
          position: 'absolute', zIndex: 3,
          width: s * 340, height: s * 180,
          background: 'linear-gradient(152deg, #0e9a8a 0%, #13b09e 48%, #0f9a8b 100%)',
          borderRadius: `${s*22}px ${s*22}px 0 0`,
          bottom: 0, left: 0,
          boxShadow: `inset 0 ${s*6}px ${s*16}px rgba(0,0,0,0.12), inset 0 -${s*4}px ${s*10}px rgba(255,255,255,0.06)`,
        }} />

        {/* Sweater subtle fold lines */}
        <div style={{
          position: 'absolute', zIndex: 4,
          width: s * 2, height: s * 80,
          background: 'rgba(0,0,0,0.06)', borderRadius: s*2,
          bottom: s * 70, left: s * 120,
        }} />
        <div style={{
          position: 'absolute', zIndex: 4,
          width: s * 2, height: s * 80,
          background: 'rgba(0,0,0,0.06)', borderRadius: s*2,
          bottom: s * 70, right: s * 120,
        }} />

        {/* V-neck collar shadow */}
        <div style={{
          position: 'absolute', zIndex: 5,
          width: 0, height: 0,
          borderLeft: `${s*28}px solid transparent`,
          borderRight: `${s*28}px solid transparent`,
          borderTop: `${s*32}px solid rgba(8,16,32,0.82)`,
          bottom: s * 148, left: s * 142,
        }} />

        {/* Neck skin fill inside V */}
        <div style={{
          position: 'absolute', zIndex: 4,
          width: s * 42, height: s * 28,
          background: 'linear-gradient(170deg, #e8a87c, #d49060)',
          clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
          bottom: s * 148, left: s * 149,
        }} />

        {/* Sweater collar fold highlight */}
        <div style={{
          position: 'absolute', zIndex: 6,
          width: s * 60, height: s * 10,
          background: 'rgba(255,255,255,0.10)',
          borderRadius: s * 6,
          bottom: s * 148, left: s * 140,
          transform: 'rotate(-2deg)',
          filter: `blur(${s*2}px)`,
        }} />

      </div>{/* end character */}

      {/* ── Subtitle ── */}
      {subtitle && (
        <div style={{
          position: 'absolute', bottom: 18, left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '88%', padding: '10px 22px',
          background: 'rgba(10,10,20,0.62)',
          color: '#fff', borderRadius: 14,
          fontSize: 15, lineHeight: 1.55,
          textAlign: 'center',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 20, pointerEvents: 'none',
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Eye — sclera, iris, pupil, highlights, lashes, eyelid (blink)
// ─────────────────────────────────────────────────────────────────────────────
function Eye({ s, left, top, eyeOff, blinking }) {
  const W = s * 58, H = s * 40;

  return (
    <div style={{
      position: 'absolute', zIndex: 5,
      width: W, height: H,
      left, top,
      borderRadius: '50%',
      overflow: 'hidden',
    }}>
      {/* Sclera */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 45% 42%, #fffef8 60%, #f0ece2 100%)',
        borderRadius: '50%',
        boxShadow: `inset 0 ${s*2}px ${s*6}px rgba(120,60,10,0.10)`,
      }} />

      {/* Iris */}
      <div style={{
        position: 'absolute',
        width: s * 24, height: s * 24,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 32%, #56c9a0 0%, #1e8a68 45%, #0d5840 80%, #0a3a2c 100%)',
        top: s * 8,
        left: s * 17 + eyeOff.x,
        boxShadow: `inset 0 ${s*1}px ${s*3}px rgba(0,0,0,0.2)`,
        transition: 'left 0.06s linear, top 0.06s linear',
      }} />

      {/* Pupil */}
      <div style={{
        position: 'absolute',
        width: s * 12, height: s * 12,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 33% 33%, #2a2a2a, #000)',
        top: s * 14 + eyeOff.y,
        left: s * 23 + eyeOff.x,
        transition: 'left 0.06s linear, top 0.06s linear',
      }} />

      {/* Main catchlight */}
      <div style={{
        position: 'absolute',
        width: s * 6, height: s * 6,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.92)',
        top: s * 10, left: s * 29,
        zIndex: 2,
      }} />
      {/* Secondary catchlight */}
      <div style={{
        position: 'absolute',
        width: s * 3, height: s * 3,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.6)',
        top: s * 20, left: s * 36,
        zIndex: 2,
      }} />

      {/* Lower sclera shadow */}
      <div style={{
        position: 'absolute',
        height: s * 4, left: s*4, right: s*4, bottom: s*2,
        background: 'rgba(130,60,10,0.12)',
        borderRadius: '0 0 50% 50%',
        zIndex: 2,
      }} />

      {/* ── EYELID (blink) ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(185deg, #f3c49a 55%, #e8a87a 100%)',
        borderRadius: '50%',
        transformOrigin: 'top center',
        transform: blinking ? 'scaleY(1)' : 'scaleY(0.02)',
        transition: blinking ? 'transform 0.055s ease-in' : 'transform 0.09s ease-out',
        zIndex: 3,
      }} />

      {/* ── UPPER LASH BAR ── */}
      <div style={{
        position: 'absolute',
        width: '116%', height: s * 7,
        background: 'linear-gradient(180deg, #2a0800 0%, #4e1404 80%, transparent 100%)',
        borderRadius: `${s*5}px ${s*5}px 2px 2px`,
        top: -s * 1, left: -s * 1,
        zIndex: 4,
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mouth — thin natural lips, opens when speaking
// ─────────────────────────────────────────────────────────────────────────────
function Mouth({ s, top, left, isSpeaking }) {
  // Thin container: W=96, H=26 (was 36)
  const W = s * 96, H = s * 26;

  return (
    <div style={{
      position: 'absolute', zIndex: 5,
      width: W, height: H,
      top, left,
      overflow: 'hidden',
      borderRadius: '50%',
    }}>
      {/* Mouth cavity — dark inside (only when open) */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 68%, #1a0503 0%, #080101 100%)',
        borderRadius: '50%',
        opacity: isSpeaking ? 1 : 0,
        transition: 'opacity 0.07s',
      }} />

      {/* Upper teeth — appear when speaking */}
      <div style={{
        position: 'absolute',
        width: '72%', height: '46%',
        top: '5%', left: '14%',
        borderRadius: `${s*2}px ${s*2}px 0 0`,
        opacity: isSpeaking ? 1 : 0,
        transition: 'opacity 0.07s',
        zIndex: 1,
        backgroundImage: [
          'linear-gradient(175deg, #faf8f2, #eeebe0)',
          'repeating-linear-gradient(90deg, transparent, transparent calc(100%/5 - 1px), rgba(190,180,165,0.32) calc(100%/5 - 1px), rgba(190,180,165,0.32) calc(100%/5))',
        ].join(','),
      }} />

      {/* ── Lower lip ── */}
      <div style={{
        position: 'absolute',
        width: '100%', height: '56%',
        background: 'linear-gradient(180deg, #c85848, #a83838)',
        borderRadius: `0 0 ${s*22}px ${s*22}px`,
        bottom: 0, left: 0,
        transformOrigin: 'bottom center',
        // Closed: very thin (0.16). Speaking: max 0.82
        transform: isSpeaking ? 'scaleY(0.82)' : 'scaleY(0.16)',
        transition: 'transform 0.09s ease',
        animation: isSpeaking ? 'emmaTalk 0.22s ease-in-out infinite' : 'none',
        zIndex: 2,
        boxShadow: `inset 0 ${s*2}px ${s*5}px rgba(0,0,0,0.12)`,
      }} />

      {/* ── Upper lip ── */}
      <div style={{
        position: 'absolute',
        width: '100%', height: '50%',
        background: 'linear-gradient(175deg, #b84438, #c85848)',
        borderRadius: `${s*22}px ${s*22}px 0 0`,
        top: 0, left: 0,
        zIndex: 3,
        transformOrigin: 'top center',
        // Closed: thin (0.42). Speaking: max 0.86
        transform: isSpeaking ? 'scaleY(0.86)' : 'scaleY(0.42)',
        transition: 'transform 0.09s ease',
        boxShadow: `inset 0 -${s*1.5}px ${s*3}px rgba(0,0,0,0.10)`,
      }} />

      {/* Cupid's bow centre dip */}
      <div style={{
        position: 'absolute',
        width: s * 14, height: s * 7,
        borderBottom: `${s*2}px solid rgba(120,28,16,0.42)`,
        borderRadius: '0 0 50% 50%',
        top: s * 1, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 4,
      }} />

      {/* Lip gloss highlight — subtle sheen on upper lip */}
      <div style={{
        position: 'absolute',
        width: '36%', height: '20%',
        background: 'rgba(255,255,255,0.16)',
        borderRadius: s * 5,
        top: '6%', left: '32%',
        filter: `blur(${s}px)`,
        zIndex: 5,
      }} />

      {/* Corner dimples */}
      <div style={{ position:'absolute', zIndex:4, width:s*4, height:s*4,
        background:'rgba(160,48,32,0.35)', borderRadius:'50%', top:'32%', left:s*1 }} />
      <div style={{ position:'absolute', zIndex:4, width:s*4, height:s*4,
        background:'rgba(160,48,32,0.35)', borderRadius:'50%', top:'32%', right:s*1 }} />
    </div>
  );
}
