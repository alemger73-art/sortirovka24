/** A string of warm lights hanging in loops along the bottom edge of the header. Decorative only. */
import { useEffect, useRef, useState } from 'react';
import { useSeasonal } from './SeasonalThemeProvider';

const STEP = 46;
const SAG = 9;

export default function Garland() {
  const { active, settings } = useSeasonal();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, settings.garland]);

  if (!active || !settings.garland) return null;
  const loops = Math.max(4, Math.round(width / STEP));
  const step = width / loops;
  let wire = `M0 2`;
  const bulbs: { x: number; y: number }[] = [];
  for (let i = 0; i < loops; i += 1) {
    const x0 = i * step;
    wire += ` Q${x0 + step / 2} ${2 + SAG * 2} ${x0 + step} 2`;
    bulbs.push({ x: x0 + step / 2, y: 2 + SAG });
  }
  return (
    <div ref={ref} className="ny-garland" aria-hidden="true">
      {width > 0 && (
        <svg width={width} height={30} viewBox={`0 0 ${width} 30`}>
          <path d={wire} className="ny-garland-wire" />
          {bulbs.map((b, i) => (
            <g key={i} className={`ny-bulb ny-bulb-${i % 3}`} style={{ animationDelay: `${(i * 0.37) % 2.4}s` }}>
              <circle cx={b.x} cy={b.y + 6} r={7} className="ny-bulb-glow" />
              <rect x={b.x - 1.6} y={b.y - 1} width={3.2} height={3} rx={0.8} className="ny-bulb-cap" />
              <ellipse cx={b.x} cy={b.y + 5} rx={2.6} ry={3.6} className="ny-bulb-glass" />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
