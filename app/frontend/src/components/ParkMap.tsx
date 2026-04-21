/**
 * ParkMap — Interactive SVG park scheme for Парк Железнодорожников.
 *
 * Renders a stylised top-down view of the park with clickable delivery
 * points.  Works on mobile (touch) and desktop (click).
 *
 * Props
 * ─────
 *  points        – delivery points from DB
 *  selectedId    – currently selected point id (or null)
 *  onSelect      – callback when user taps a point
 *  userLocation  – optional {lat,lng} to show approximate user dot
 *  readOnly      – if true, disable selection (courier view)
 *  highlightId   – point id to pulse (courier delivery target)
 *  className     – extra wrapper classes
 */

import { useMemo } from 'react';

/* ─── Types ─── */
export interface ParkPoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  description: string;
  is_active: boolean;
  sort_order: number;
}

interface ParkMapProps {
  points: ParkPoint[];
  selectedId?: number | null;
  onSelect?: (point: ParkPoint) => void;
  userLocation?: { lat: number; lng: number } | null;
  readOnly?: boolean;
  highlightId?: number | null;
  className?: string;
}

/* ─── Coordinate mapping ─── */
// Real-world bounding box of the park (lat/lng)
const BOUNDS = {
  minLat: 54.9210,
  maxLat: 54.9245,
  minLng: 73.3660,
  maxLng: 73.3725,
};

// SVG viewBox dimensions
const SVG_W = 800;
const SVG_H = 600;
const PAD = 40; // padding inside SVG

function geoToSvg(lat: number, lng: number): { x: number; y: number } {
  const x = PAD + ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * (SVG_W - 2 * PAD);
  // lat is inverted (higher lat = top of map)
  const y = PAD + ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * (SVG_H - 2 * PAD);
  return { x, y };
}

/* ─── Emoji to icon mapping for points ─── */
function getPointIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('вход') || n.includes('выход')) return '🚪';
  if (n.includes('фонтан')) return '⛲';
  if (n.includes('детск') || n.includes('площадк')) return '🎠';
  if (n.includes('беседк') || n.includes('озер') || n.includes('пруд')) return '🏕️';
  if (n.includes('скамейк') || n.includes('аллея') || n.includes('аллеи') || n.includes('отдых')) return '🪑';
  if (n.includes('спорт') || n.includes('тренаж')) return '🏋️';
  if (n.includes('сцен') || n.includes('амфитеатр')) return '🎭';
  if (n.includes('карусел') || n.includes('аттракцион')) return '🎡';
  return '📍';
}

/* ─── Tree cluster positions (decorative) ─── */
const TREES: { x: number; y: number; r: number }[] = [
  // Scattered trees around the park
  { x: 80, y: 80, r: 18 }, { x: 140, y: 60, r: 14 }, { x: 200, y: 90, r: 16 },
  { x: 700, y: 80, r: 17 }, { x: 650, y: 110, r: 13 }, { x: 720, y: 140, r: 15 },
  { x: 100, y: 500, r: 16 }, { x: 160, y: 520, r: 14 }, { x: 60, y: 460, r: 18 },
  { x: 680, y: 480, r: 15 }, { x: 740, y: 510, r: 17 }, { x: 620, y: 520, r: 13 },
  { x: 300, y: 50, r: 12 }, { x: 500, y: 60, r: 14 }, { x: 350, y: 540, r: 13 },
  { x: 450, y: 550, r: 15 }, { x: 50, y: 280, r: 16 }, { x: 750, y: 300, r: 14 },
  // Dense areas
  { x: 120, y: 200, r: 12 }, { x: 90, y: 240, r: 14 }, { x: 150, y: 260, r: 11 },
  { x: 650, y: 200, r: 13 }, { x: 690, y: 250, r: 12 }, { x: 670, y: 180, r: 15 },
  { x: 250, y: 150, r: 11 }, { x: 550, y: 150, r: 12 }, { x: 300, y: 450, r: 13 },
  { x: 500, y: 450, r: 11 },
];

export default function ParkMap({
  points,
  selectedId,
  onSelect,
  userLocation,
  readOnly = false,
  highlightId,
  className = '',
}: ParkMapProps) {
  // Map points to SVG coordinates
  const mappedPoints = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        svg: geoToSvg(p.lat, p.lng),
        icon: getPointIcon(p.name),
      })),
    [points],
  );

  // Map user location
  const userSvg = useMemo(
    () => (userLocation ? geoToSvg(userLocation.lat, userLocation.lng) : null),
    [userLocation],
  );

  return (
    <div className={`relative w-full ${className}`}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto rounded-2xl"
        style={{ maxHeight: '420px', touchAction: 'manipulation' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Gradient for park background */}
          <linearGradient id="parkBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8f5e9" />
            <stop offset="100%" stopColor="#c8e6c9" />
          </linearGradient>
          {/* Gradient for paths */}
          <linearGradient id="pathGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d7ccc8" />
            <stop offset="100%" stopColor="#bcaaa4" />
          </linearGradient>
          {/* Water gradient */}
          <radialGradient id="waterGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#81d4fa" />
            <stop offset="100%" stopColor="#4fc3f7" />
          </radialGradient>
          {/* Fountain gradient */}
          <radialGradient id="fountainGrad" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#b3e5fc" />
            <stop offset="100%" stopColor="#4dd0e1" />
          </radialGradient>
          {/* Selected point glow */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Pulse animation */}
          <filter id="pulseGlow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ═══ BACKGROUND ═══ */}
        <rect x="0" y="0" width={SVG_W} height={SVG_H} rx="16" fill="url(#parkBg)" />

        {/* Park border / fence */}
        <rect
          x="20" y="20" width={SVG_W - 40} height={SVG_H - 40}
          rx="24" fill="none" stroke="#a5d6a7" strokeWidth="3" strokeDasharray="12 6"
        />

        {/* ═══ PATHS / ALLEYS ═══ */}
        {/* Main horizontal alley */}
        <path
          d="M 60 300 Q 200 290 400 300 Q 600 310 740 300"
          fill="none" stroke="#d7ccc8" strokeWidth="14" strokeLinecap="round"
        />
        {/* Main vertical alley */}
        <path
          d="M 400 60 Q 390 200 400 300 Q 410 400 400 540"
          fill="none" stroke="#d7ccc8" strokeWidth="14" strokeLinecap="round"
        />
        {/* Diagonal paths */}
        <path
          d="M 120 120 Q 250 200 400 300"
          fill="none" stroke="#d7ccc8" strokeWidth="10" strokeLinecap="round"
        />
        <path
          d="M 680 120 Q 550 200 400 300"
          fill="none" stroke="#d7ccc8" strokeWidth="10" strokeLinecap="round"
        />
        <path
          d="M 120 480 Q 250 400 400 300"
          fill="none" stroke="#d7ccc8" strokeWidth="10" strokeLinecap="round"
        />
        <path
          d="M 680 480 Q 550 400 400 300"
          fill="none" stroke="#d7ccc8" strokeWidth="10" strokeLinecap="round"
        />
        {/* Secondary paths */}
        <path
          d="M 200 180 Q 300 200 400 180"
          fill="none" stroke="#e0d5c8" strokeWidth="6" strokeLinecap="round"
        />
        <path
          d="M 400 420 Q 500 440 600 420"
          fill="none" stroke="#e0d5c8" strokeWidth="6" strokeLinecap="round"
        />

        {/* ═══ WATER / POND ═══ */}
        <ellipse cx="580" cy="380" rx="55" ry="35" fill="url(#waterGrad)" opacity="0.7" />
        <ellipse cx="580" cy="380" rx="45" ry="28" fill="none" stroke="#4fc3f7" strokeWidth="1" opacity="0.5" />

        {/* ═══ FOUNTAIN (center) ═══ */}
        <circle cx="400" cy="300" r="28" fill="url(#fountainGrad)" opacity="0.8" />
        <circle cx="400" cy="300" r="18" fill="none" stroke="#4dd0e1" strokeWidth="2" opacity="0.6" />
        <circle cx="400" cy="300" r="8" fill="#b3e5fc" opacity="0.9" />
        {/* Fountain water jets */}
        <line x1="400" y1="282" x2="400" y2="272" stroke="#81d4fa" strokeWidth="2" opacity="0.7" />
        <line x1="388" y1="286" x2="383" y2="278" stroke="#81d4fa" strokeWidth="1.5" opacity="0.6" />
        <line x1="412" y1="286" x2="417" y2="278" stroke="#81d4fa" strokeWidth="1.5" opacity="0.6" />

        {/* ═══ STRUCTURES ═══ */}
        {/* Stage / Amphitheater (bottom-right area) */}
        <path
          d="M 600 440 Q 620 420 660 440 Q 640 460 600 440 Z"
          fill="#ffcc80" stroke="#ffa726" strokeWidth="2" opacity="0.7"
        />
        <rect x="610" y="430" width="40" height="20" rx="4" fill="#ffe0b2" stroke="#ffb74d" strokeWidth="1" opacity="0.6" />

        {/* Playground area (top-left) */}
        <rect x="180" y="160" width="60" height="40" rx="8" fill="#fff9c4" stroke="#fdd835" strokeWidth="2" opacity="0.6" />

        {/* Sports area (top-right) */}
        <rect x="560" y="140" width="70" height="50" rx="6" fill="#e1f5fe" stroke="#29b6f6" strokeWidth="2" opacity="0.5" />

        {/* Benches along main alley */}
        {[180, 280, 520, 620].map((bx) => (
          <g key={`bench-${bx}`}>
            <rect x={bx - 8} y="288" width="16" height="6" rx="2" fill="#8d6e63" opacity="0.5" />
            <rect x={bx - 8} y="308" width="16" height="6" rx="2" fill="#8d6e63" opacity="0.5" />
          </g>
        ))}

        {/* ═══ TREES ═══ */}
        {TREES.map((t, i) => (
          <circle
            key={`tree-${i}`}
            cx={t.x} cy={t.y} r={t.r}
            fill="#66bb6a" opacity={0.35 + (i % 3) * 0.1}
          />
        ))}

        {/* ═══ ENTRANCE MARKERS ═══ */}
        {/* Main entrance (bottom-center) */}
        <g>
          <rect x="370" y="540" width="60" height="22" rx="6" fill="#fff" stroke="#43a047" strokeWidth="2" />
          <text x="400" y="555" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#2e7d32">ВХОД</text>
        </g>
        {/* Side exit (bottom-left) */}
        <g>
          <rect x="50" y="460" width="50" height="18" rx="5" fill="#fff" stroke="#66bb6a" strokeWidth="1.5" />
          <text x="75" y="473" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#388e3c">ВЫХОД</text>
        </g>

        {/* ═══ LABELS ═══ */}
        <text x="400" y="265" textAnchor="middle" fontSize="9" fontWeight="600" fill="#00897b" opacity="0.7">Фонтан</text>
        <text x="210" y="155" textAnchor="middle" fontSize="8" fontWeight="600" fill="#f9a825" opacity="0.7">Детская площадка</text>
        <text x="595" y="135" textAnchor="middle" fontSize="8" fontWeight="600" fill="#0288d1" opacity="0.7">Спортзона</text>
        <text x="580" y="370" textAnchor="middle" fontSize="8" fontWeight="600" fill="#0277bd" opacity="0.6">Пруд</text>
        <text x="630" y="425" textAnchor="middle" fontSize="8" fontWeight="600" fill="#ef6c00" opacity="0.6">Сцена</text>

        {/* ═══ PARK TITLE ═══ */}
        <text x="400" y="42" textAnchor="middle" fontSize="13" fontWeight="800" fill="#2e7d32" opacity="0.5">
          🌳 Парк Железнодорожников
        </text>

        {/* ═══ DELIVERY POINTS ═══ */}
        {mappedPoints.map((p) => {
          const isSelected = selectedId === p.id;
          const isHighlighted = highlightId === p.id;
          const isActive = isSelected || isHighlighted;

          return (
            <g
              key={p.id}
              onClick={() => !readOnly && onSelect?.(p)}
              style={{ cursor: readOnly ? 'default' : 'pointer' }}
              role={readOnly ? undefined : 'button'}
              tabIndex={readOnly ? undefined : 0}
              onKeyDown={(e) => {
                if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelect?.(p);
                }
              }}
            >
              {/* Pulse ring for selected/highlighted */}
              {isActive && (
                <>
                  <circle
                    cx={p.svg.x} cy={p.svg.y} r="24"
                    fill="none"
                    stroke={isHighlighted ? '#f44336' : '#43a047'}
                    strokeWidth="2"
                    opacity="0.6"
                  >
                    <animate attributeName="r" from="20" to="32" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                  <circle
                    cx={p.svg.x} cy={p.svg.y} r="18"
                    fill={isHighlighted ? '#ef5350' : '#43a047'}
                    opacity="0.15"
                  />
                </>
              )}

              {/* Point circle */}
              <circle
                cx={p.svg.x} cy={p.svg.y}
                r={isActive ? 18 : 15}
                fill={isActive ? (isHighlighted ? '#f44336' : '#2e7d32') : '#fff'}
                stroke={isActive ? '#fff' : '#43a047'}
                strokeWidth={isActive ? 3 : 2}
                filter={isActive ? 'url(#glow)' : undefined}
                className="transition-all duration-200"
              />

              {/* Point icon */}
              <text
                x={p.svg.x} y={p.svg.y + 1}
                textAnchor="middle" dominantBaseline="central"
                fontSize={isActive ? 14 : 12}
                className="pointer-events-none select-none"
              >
                {p.icon}
              </text>

              {/* Point label */}
              <g className="pointer-events-none">
                <rect
                  x={p.svg.x - (p.name.length * 3.2)}
                  y={p.svg.y + (isActive ? 22 : 19)}
                  width={p.name.length * 6.4}
                  height="16"
                  rx="4"
                  fill={isActive ? (isHighlighted ? '#f44336' : '#2e7d32') : '#fff'}
                  stroke={isActive ? 'none' : '#e0e0e0'}
                  strokeWidth="1"
                  opacity={isActive ? 0.95 : 0.9}
                />
                <text
                  x={p.svg.x}
                  y={p.svg.y + (isActive ? 33 : 30)}
                  textAnchor="middle"
                  fontSize={isActive ? 8 : 7}
                  fontWeight={isActive ? 700 : 600}
                  fill={isActive ? '#fff' : '#424242'}
                  className="select-none"
                >
                  {p.name}
                </text>
              </g>
            </g>
          );
        })}

        {/* ═══ USER LOCATION ═══ */}
        {userSvg && (
          <g>
            <circle cx={userSvg.x} cy={userSvg.y} r="14" fill="#1976d2" opacity="0.15">
              <animate attributeName="r" from="14" to="24" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.15" to="0" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={userSvg.x} cy={userSvg.y} r="7" fill="#1976d2" stroke="#fff" strokeWidth="2.5" />
          </g>
        )}
      </svg>

      {/* Legend (bottom) */}
      {!readOnly && (
        <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-white border-2 border-green-600 inline-block" />
            Точка доставки
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-green-700 inline-block" />
            Выбрано
          </span>
          {userSvg && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
              Вы здесь
            </span>
          )}
        </div>
      )}
    </div>
  );
}