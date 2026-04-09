'use client';

/**
 * EmmaAvatar — reusable SVG avatar
 * size: 'sm' (28px) | 'md' (34px) | 'lg' (185px)
 * mode: 'day' | 'night'
 */
export default function EmmaAvatar({ size = 'lg', mode = 'day', className = '' }) {
  const dim = size === 'sm' ? 28 : size === 'md' ? 34 : 185;
  const bg  = mode === 'night' ? '#1c1230' : '#fde8d4';
  const bodyColor = '#2a7a6a';
  const hairDark  = mode === 'night' ? '#5c1e08' : '#7a2810';
  const hairMid   = mode === 'night' ? '#7a2810' : '#9e3e1a';

  if (size === 'lg') {
    return (
      <svg
        viewBox="0 0 185 215"
        width={185}
        height={215}
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="sk" cx="50%" cy="38%" r="52%">
            <stop offset="0%" stopColor="#fce0bb" />
            <stop offset="100%" stopColor="#e8b07a" />
          </radialGradient>
          <radialGradient id="hr" cx="50%" cy="25%" r="58%">
            <stop offset="0%" stopColor={hairMid} />
            <stop offset="100%" stopColor={hairDark} />
          </radialGradient>
          <radialGradient id="bodyG" cx="50%" cy="0%" r="100%">
            <stop offset="0%" stopColor="#2a8070" />
            <stop offset="100%" stopColor="#1d5c52" />
          </radialGradient>
        </defs>
        {/* body */}
        <ellipse cx="92" cy="218" rx="62" ry="28" fill="#1d5c52" />
        <rect x="42" y="162" width="100" height="65" rx="18" fill="url(#bodyG)" />
        <ellipse cx="92" cy="163" rx="18" ry="7" fill="#3aa090" opacity="0.4" />
        {/* neck */}
        <rect x="80" y="146" width="24" height="22" rx="7" fill="url(#sk)" />
        {/* head */}
        <ellipse cx="92" cy="112" rx="48" ry="52" fill="url(#sk)" />
        {/* ears */}
        <ellipse cx="44" cy="110" rx="7" ry="10" fill="#e0a870" />
        <ellipse cx="140" cy="110" rx="7" ry="10" fill="#e0a870" />
        {/* hair sides */}
        <ellipse cx="47" cy="105" rx="14" ry="36" fill="url(#hr)" />
        <ellipse cx="137" cy="105" rx="14" ry="36" fill="url(#hr)" />
        {/* hair top */}
        <ellipse cx="92" cy="68" rx="50" ry="28" fill="url(#hr)" />
        <ellipse cx="92" cy="52" rx="21" ry="16" fill={hairDark} />
        <ellipse cx="92" cy="47" rx="15" ry="10" fill={hairMid} />
        <ellipse cx="88" cy="44" rx="5" ry="3" fill={hairMid} opacity="0.5" />
        {/* eye whites */}
        <ellipse cx="76" cy="110" rx="8" ry="9" fill="white" />
        <ellipse cx="108" cy="110" rx="8" ry="9" fill="white" />
        {/* irises */}
        <ellipse cx="76" cy="111" rx="5" ry="6" fill="#2d7a6a" />
        <ellipse cx="108" cy="111" rx="5" ry="6" fill="#2d7a6a" />
        {/* pupils */}
        <ellipse cx="76.5" cy="111" rx="2.5" ry="3" fill="#1a0a05" />
        <ellipse cx="108.5" cy="111" rx="2.5" ry="3" fill="#1a0a05" />
        {/* sparkles */}
        <ellipse cx="78" cy="109" rx="1.2" ry="1.4" fill="white" />
        <ellipse cx="110" cy="109" rx="1.2" ry="1.4" fill="white" />
        {/* eyelid lines */}
        <path d="M68 104 Q76 100 84 104" stroke={hairDark} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M100 104 Q108 100 116 104" stroke={hairDark} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* eyebrows */}
        <path d="M67 97 Q76 92 85 96" stroke={hairDark} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M99 96 Q108 92 117 97" stroke={hairDark} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {/* nose */}
        <path d="M90 120 Q92 126 94 120" stroke="#d09060" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {/* smile */}
        <path d="M79 132 Q92 142 105 132" stroke="#c06040" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* cheek blush */}
        <ellipse cx="62" cy="122" rx="10" ry="6" fill="rgba(220,100,80,0.16)" />
        <ellipse cx="122" cy="122" rx="10" ry="6" fill="rgba(220,100,80,0.16)" />
        {/* lip */}
        <path d="M84 133 Q92 137 100 133" stroke="#d07858" strokeWidth="1" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  // sm / md — compact circle avatar
  const vb = dim;
  const cx = dim / 2;
  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      width={dim}
      height={dim}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect width={vb} height={vb} fill={bg} />
      <ellipse cx={cx} cy={vb * 0.65} rx={vb * 0.32} ry={vb * 0.22} fill={bodyColor} />
      <ellipse cx={cx} cy={vb * 0.46} rx={vb * 0.26} ry={vb * 0.3} fill="#f5c9a0" />
      <ellipse cx={cx} cy={vb * 0.24} rx={vb * 0.28} ry={vb * 0.17} fill={hairDark} />
      <ellipse cx={vb * 0.22} cy={vb * 0.43} rx={vb * 0.075} ry={vb * 0.19} fill={hairDark} />
      <ellipse cx={vb * 0.78} cy={vb * 0.43} rx={vb * 0.075} ry={vb * 0.19} fill={hairDark} />
      <ellipse cx={cx - vb * 0.1} cy={vb * 0.47} rx={vb * 0.065} ry={vb * 0.08} fill="#2d7a6a" />
      <ellipse cx={cx + vb * 0.1} cy={vb * 0.47} rx={vb * 0.065} ry={vb * 0.08} fill="#2d7a6a" />
      <path
        d={`M${cx - vb * 0.09} ${vb * 0.62} Q${cx} ${vb * 0.7} ${cx + vb * 0.09} ${vb * 0.62}`}
        stroke="#c06040"
        strokeWidth={dim === 28 ? 1.1 : 1.3}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
