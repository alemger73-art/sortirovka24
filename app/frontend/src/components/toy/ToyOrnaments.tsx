/**
 * Kazakh ою for the invitations, drawn as gold foil: қошқар мүйіз (ram's horn) corners, dividers and the шаңырақ seal.
 * The foil gradient is defined once per card (<GoldDefs/>) and its colours come from the theme (--g1…--g4).
 */
export function GoldDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="toy-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--g1)' }} />
          <stop offset=".35" style={{ stopColor: 'var(--g2)' }} />
          <stop offset=".55" style={{ stopColor: 'var(--g3)' }} />
          <stop offset=".8" style={{ stopColor: 'var(--g2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--g4)' }} />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** One ram's-horn curl pair, used in the corners of frames. Corner sits at top-left. */
export function OyuCorner({ className = '' }: { className?: string }) {
  return (
    <svg className={`oyu oyu-corner ${className}`} viewBox="0 0 120 120" aria-hidden="true">
      <g fill="none" stroke="url(#toy-gold)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M6 6 C 38 6, 66 8, 76 24 C 83 36, 72 47, 61 42 C 52 38, 56 27, 65 29" />
        <path d="M6 6 C 6 38, 8 66, 24 76 C 36 83, 47 72, 42 61 C 38 52, 27 56, 29 65" />
        <path d="M6 6 C 20 20, 30 30, 46 34 C 58 37, 66 52, 56 58 C 49 62, 43 55, 48 51" strokeWidth="1.6" />
        <path d="M6 6 C 20 20, 30 30, 34 46 C 37 58, 52 66, 58 56 C 62 49, 55 43, 51 48" strokeWidth="1.6" />
        <path d="M86 8 H 116 M8 86 V 116" strokeWidth="1.2" strokeOpacity=".7" />
      </g>
      <g fill="url(#toy-gold)">
        <circle cx="6" cy="6" r="4" />
        <circle cx="84" cy="8" r="2" /><circle cx="8" cy="84" r="2" />
      </g>
    </svg>
  );
}

/** Centre divider: two horns turning away from each other, with a diamond. */
export function OyuDivider({ className = '' }: { className?: string }) {
  return (
    <svg className={`oyu oyu-divider ${className}`} viewBox="0 0 260 44" aria-hidden="true">
      <g fill="none" stroke="url(#toy-gold)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M130 36 C 130 22, 118 10, 104 14 C 93 17, 94 31, 105 29 C 112 28, 111 20, 105 21" />
        <path d="M130 36 C 130 22, 142 10, 156 14 C 167 17, 166 31, 155 29 C 148 28, 149 20, 155 21" />
        <path d="M118 38 C 100 40, 82 30, 70 30 H 8" strokeWidth="1.2" />
        <path d="M142 38 C 160 40, 178 30, 190 30 H 252" strokeWidth="1.2" />
      </g>
      <g fill="url(#toy-gold)"><path d="M130 30 l5 6 -5 6 -5 -6z" /><circle cx="6" cy="30" r="2.4" /><circle cx="254" cy="30" r="2.4" /></g>
    </svg>
  );
}

/** Шаңырақ — the crown of the yurt: the seal, and the emblem when there is no photo. */
export function Shanyrak({ className = '' }: { className?: string }) {
  const poles = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [120 + Math.cos(a) * 64, 120 + Math.sin(a) * 64, 120 + Math.cos(a) * 104, 120 + Math.sin(a) * 104];
  });
  return (
    <svg className={`shanyrak ${className}`} viewBox="0 0 240 240" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="120" cy="120" r="108" strokeOpacity=".35" />
        <circle cx="120" cy="120" r="64" strokeWidth="3" />
        <circle cx="120" cy="120" r="56" strokeOpacity=".6" />
        <path d="M120 56 Q 150 120 120 184 M120 56 Q 90 120 120 184 M56 120 Q 120 150 184 120 M56 120 Q 120 90 184 120" strokeWidth="3" />
        <g strokeWidth="2">{poles.map(([a, b, c, d], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} />)}</g>
      </g>
    </svg>
  );
}

/** A frame with ою in all four corners around its children. */
export function OyuFrame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`oyu-frame ${className}`}>
      <OyuCorner className="c tl" /><OyuCorner className="c tr" /><OyuCorner className="c bl" /><OyuCorner className="c br" />
      {children}
    </div>
  );
}
