'use client';

/**
 * Emma Avatar — CSS 2D animated character
 * Props:
 *   isSpeaking: boolean  — opens mouth + animates when AI is talking
 *   size: number         — width in px (height auto-scales, default 160)
 */
export default function AvatarEmma({ isSpeaking = false, size = 160 }) {
  const s = size / 160;

  return (
    <div style={{ position: 'relative', width: s * 160, height: s * 196, flexShrink: 0, userSelect: 'none' }}>

      <style>{`
        @keyframes emmaEyelidBlink {
          0%, 87%, 100% { transform: scaleY(0.02); }
          91%, 96%      { transform: scaleY(1);    }
        }
        @keyframes emmaMouthTalk {
          0%, 100% { transform: scaleY(0.45); }
          50%      { transform: scaleY(1);    }
        }
        @keyframes emmaHairShine {
          0%, 100% { opacity: 0.25; }
          50%      { opacity: 0.45; }
        }
      `}</style>

      {/* ── HAIR — back mass ── */}
      <div style={{
        position: 'absolute', zIndex: 1,
        width: s * 122, height: s * 90,
        background: 'radial-gradient(ellipse at 48% 28%, #c04820 0%, #8a2808 55%, #6a1c04 100%)',
        borderRadius: '50% 50% 38% 38%',
        top: s * 4, left: s * 19,
      }} />

      {/* Hair left flow */}
      <div style={{
        position: 'absolute', zIndex: 1,
        width: s * 30, height: s * 114,
        background: 'linear-gradient(175deg, #a03a18 0%, #6e1e08 55%, #4e1204 100%)',
        borderRadius: '15% 0% 65% 35%',
        top: s * 34, left: s * 6,
      }} />

      {/* Hair right flow */}
      <div style={{
        position: 'absolute', zIndex: 1,
        width: s * 30, height: s * 114,
        background: 'linear-gradient(185deg, #a03a18 0%, #6e1e08 55%, #4e1204 100%)',
        borderRadius: '0% 15% 35% 65%',
        top: s * 34, right: s * 6,
      }} />

      {/* Hair shine highlight */}
      <div style={{
        position: 'absolute', zIndex: 1,
        width: s * 32, height: s * 36,
        background: 'rgba(230,110,70,0.3)',
        borderRadius: '50%',
        top: s * 10, left: s * 48,
        filter: `blur(${s * 7}px)`,
        animation: 'emmaHairShine 3s ease-in-out infinite',
      }} />

      {/* ── FACE oval ── */}
      <div style={{
        position: 'absolute', zIndex: 2,
        width: s * 100, height: s * 118,
        background: 'linear-gradient(162deg, #f7ccaa 0%, #eaaa7e 52%, #da9060 100%)',
        borderRadius: '49% 49% 44% 44%',
        top: s * 22, left: s * 30,
        boxShadow: [
          `inset -${s*5}px ${s*7}px ${s*16}px rgba(0,0,0,0.08)`,
          `inset ${s*3}px -${s*3}px ${s*10}px rgba(255,210,170,0.25)`,
        ].join(', '),
      }} />

      {/* ── EARS ── */}
      <div style={{ position: 'absolute', zIndex: 2, width: s * 15, height: s * 20, background: '#e4a076', borderRadius: '50%', top: s * 72, left: s * 25 }} />
      <div style={{ position: 'absolute', zIndex: 2, width: s * 15, height: s * 20, background: '#e4a076', borderRadius: '50%', top: s * 72, right: s * 25 }} />

      {/* ── HAIR front — over ears ── */}
      <div style={{
        position: 'absolute', zIndex: 3,
        width: s * 90, height: s * 38,
        background: 'linear-gradient(180deg, #b04020 0%, #8a2808 100%)',
        borderRadius: '50% 50% 0 0',
        top: s * 18, left: s * 35,
      }} />

      {/* ── CHEEK BLUSH ── */}
      <div style={{ position: 'absolute', zIndex: 4, width: s * 28, height: s * 15, background: 'rgba(240,120,95,0.22)', borderRadius: '50%', top: s * 98, left: s * 33, filter: `blur(${s * 4}px)` }} />
      <div style={{ position: 'absolute', zIndex: 4, width: s * 28, height: s * 15, background: 'rgba(240,120,95,0.22)', borderRadius: '50%', top: s * 98, right: s * 33, filter: `blur(${s * 4}px)` }} />

      {/* ── EYEBROWS ── */}
      <div style={{ position: 'absolute', zIndex: 5, width: s * 27, height: s * 5, background: 'linear-gradient(90deg,#6a1e08,#8a2e10)', borderRadius: '3px 5px 3px 2px', top: s * 60, left: s * 37, transform: 'rotate(-8deg)' }} />
      <div style={{ position: 'absolute', zIndex: 5, width: s * 27, height: s * 5, background: 'linear-gradient(270deg,#6a1e08,#8a2e10)', borderRadius: '5px 3px 2px 3px', top: s * 60, right: s * 37, transform: 'rotate(8deg)' }} />

      {/* ── EYES ── */}
      <EmmaEye s={s} left={s * 35} top={s * 70} />
      <EmmaEye s={s} left={s * 95} top={s * 70} />

      {/* ── NOSE ── */}
      {/* Bridge */}
      <div style={{ position: 'absolute', zIndex: 5, width: s * 4, height: s * 14, background: 'rgba(190,95,45,0.1)', borderRadius: '2px', top: s * 88, left: s * 78 }} />
      {/* Left nostril */}
      <div style={{ position: 'absolute', zIndex: 5, width: s * 7, height: s * 5, background: 'rgba(170,78,38,0.28)', borderRadius: '50%', top: s * 100, left: s * 66 }} />
      {/* Right nostril */}
      <div style={{ position: 'absolute', zIndex: 5, width: s * 7, height: s * 5, background: 'rgba(170,78,38,0.28)', borderRadius: '50%', top: s * 100, right: s * 66 }} />

      {/* ── MOUTH ── */}
      <EmmaMouth s={s} isSpeaking={isSpeaking} />

      {/* ── NECK ── */}
      <div style={{
        position: 'absolute', zIndex: 2,
        width: s * 38, height: s * 28,
        background: 'linear-gradient(175deg, #e4a076, #d29060)',
        top: s * 134, left: s * 61,
      }} />

      {/* ── TEAL SWEATER / COLLAR ── */}
      <div style={{
        position: 'absolute', zIndex: 3,
        width: s * 160, height: s * 40,
        background: 'linear-gradient(148deg, #0c8a7a 0%, #11998e 50%, #0e8a7d 100%)',
        borderRadius: `${s * 18}px ${s * 18}px 0 0`,
        top: s * 156, left: 0,
        boxShadow: `inset 0 ${s*4}px ${s*10}px rgba(0,0,0,0.15)`,
      }} />

      {/* V-neck dark triangle */}
      <div style={{
        position: 'absolute', zIndex: 4,
        width: 0, height: 0,
        borderLeft: `${s * 22}px solid transparent`,
        borderRight: `${s * 22}px solid transparent`,
        borderTop: `${s * 24}px solid #0d1020`,
        top: s * 156, left: s * 58,
      }} />

      {/* Neck skin fill in V */}
      <div style={{
        position: 'absolute', zIndex: 3,
        width: s * 28, height: s * 20,
        background: 'linear-gradient(175deg, #e4a076, #d29060)',
        clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
        top: s * 156, left: s * 66,
      }} />

    </div>
  );
}

/* ─── Eye Component ─── */
function EmmaEye({ s, left, top }) {
  return (
    <div style={{
      position: 'absolute', zIndex: 5,
      width: s * 30, height: s * 22,
      left, top,
      borderRadius: '50%',
      overflow: 'hidden',
    }}>
      {/* Sclera */}
      <div style={{ position: 'absolute', inset: 0, background: '#fffdf8', borderRadius: '50%' }} />

      {/* Iris */}
      <div style={{
        position: 'absolute',
        width: s * 16, height: s * 16,
        background: 'radial-gradient(circle at 36% 34%, #3ca882, #167050, #0a4a30)',
        borderRadius: '50%',
        top: s * 3, left: s * 7,
      }} />

      {/* Pupil */}
      <div style={{
        position: 'absolute',
        width: s * 8, height: s * 8,
        background: 'radial-gradient(circle at 35% 35%, #1a1a1a, #000)',
        borderRadius: '50%',
        top: s * 7, left: s * 11,
      }} />

      {/* Primary highlight */}
      <div style={{ position: 'absolute', width: s * 4, height: s * 4, background: 'rgba(255,255,255,0.95)', borderRadius: '50%', top: s * 4, left: s * 14, zIndex: 1 }} />
      {/* Secondary highlight */}
      <div style={{ position: 'absolute', width: s * 2, height: s * 2, background: 'rgba(255,255,255,0.65)', borderRadius: '50%', top: s * 11, left: s * 18, zIndex: 1 }} />

      {/* Lower lash line */}
      <div style={{ position: 'absolute', height: s * 1.5, background: 'rgba(110,45,10,0.2)', borderRadius: '0 0 50% 50%', bottom: s * 1.5, left: s * 3, right: s * 3, zIndex: 1 }} />

      {/* Eyelid — animates scaleY for blink */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(185deg, #f2c498 60%, #e8a47a 100%)',
        borderRadius: '50%',
        transformOrigin: 'top center',
        transform: 'scaleY(0.02)',
        animation: 'emmaEyelidBlink 3.6s ease-in-out infinite',
        zIndex: 2,
      }} />

      {/* Top eyelash bar */}
      <div style={{
        position: 'absolute',
        width: '112%', height: s * 5,
        background: 'linear-gradient(180deg, #3a0e00 0%, #5c1c04 100%)',
        borderRadius: `${s * 5}px ${s * 5}px 1px 1px`,
        top: -s * 0.5, left: -s * 0.5,
        zIndex: 3,
      }} />
    </div>
  );
}

/* ─── Mouth Component ─── */
function EmmaMouth({ s, isSpeaking }) {
  return (
    <div style={{
      position: 'absolute', zIndex: 5,
      width: s * 40, height: s * 22,
      top: s * 110, left: s * 60,
      overflow: 'hidden',
      borderRadius: '50%',
    }}>

      {/* Mouth cavity (dark inside when open) */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 60%, #1a0604, #0a0202)',
        borderRadius: '50%',
        opacity: isSpeaking ? 1 : 0,
        transition: 'opacity 0.06s ease',
      }} />

      {/* Upper teeth row */}
      <div style={{
        position: 'absolute',
        width: '80%', height: '42%',
        background: 'linear-gradient(180deg, #f8f6f0, #ede8e0)',
        top: '8%', left: '10%',
        borderRadius: `${s * 2}px ${s * 2}px 0 0`,
        opacity: isSpeaking ? 1 : 0,
        transition: 'opacity 0.06s ease',
        zIndex: 1,
        /* Tooth dividers */
        backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent calc(100%/6 - 1px), rgba(200,190,180,0.4) calc(100%/6 - 1px), rgba(200,190,180,0.4) calc(100%/6))',
      }} />

      {/* Lower lip — animates when speaking */}
      <div style={{
        position: 'absolute',
        width: '100%', height: '56%',
        background: 'linear-gradient(180deg, #d06858, #b84840)',
        borderRadius: `0 0 ${s * 20}px ${s * 20}px`,
        bottom: 0, left: 0,
        transformOrigin: 'bottom center',
        transform: isSpeaking ? 'scaleY(1)' : 'scaleY(0.42)',
        transition: 'transform 0.08s ease',
        animation: isSpeaking ? 'emmaMouthTalk 0.21s ease-in-out infinite' : 'none',
        zIndex: 2,
        boxShadow: `inset 0 ${s*2}px ${s*4}px rgba(0,0,0,0.15)`,
      }} />

      {/* Upper lip */}
      <div style={{
        position: 'absolute',
        width: '100%', height: '48%',
        background: 'linear-gradient(180deg, #c05848, #d06858)',
        borderRadius: `${s * 20}px ${s * 20}px 0 0`,
        top: 0, left: 0,
        zIndex: 3,
        transformOrigin: 'top center',
        transform: isSpeaking ? 'scaleY(1)' : 'scaleY(0.75)',
        transition: 'transform 0.08s ease',
      }} />

      {/* Cupid's bow dip */}
      <div style={{
        position: 'absolute',
        width: s * 10, height: s * 5,
        borderBottom: `${s * 2}px solid rgba(140,40,28,0.5)`,
        top: s * 2, left: s * 15,
        borderRadius: '0 0 50% 50%',
        zIndex: 4,
      }} />

      {/* Smile crease left */}
      <div style={{ position: 'absolute', width: s * 4, height: s * 4, background: 'rgba(180,68,48,0.4)', borderRadius: '50%', top: '38%', left: s * 1, zIndex: 4 }} />
      {/* Smile crease right */}
      <div style={{ position: 'absolute', width: s * 4, height: s * 4, background: 'rgba(180,68,48,0.4)', borderRadius: '50%', top: '38%', right: s * 1, zIndex: 4 }} />

    </div>
  );
}
