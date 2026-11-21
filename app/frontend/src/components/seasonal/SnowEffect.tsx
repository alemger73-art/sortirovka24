/** Falling snow on one fixed canvas. Never takes taps, sleeps while the tab is hidden, off for reduced motion. */
import { useEffect, useRef } from 'react';
import { useSeasonal } from './SeasonalThemeProvider';

const PER_LEVEL = [0, 26, 48, 80];

interface Flake { x: number; y: number; r: number; vy: number; drift: number; phase: number; alpha: number }

function makeFlake(w: number, h: number, anywhere: boolean): Flake {
  const r = 0.8 + Math.random() * 2.2;
  return {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -6,
    r,
    vy: 18 + r * 14 + Math.random() * 10,
    drift: 6 + Math.random() * 14,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.45 + Math.random() * 0.5,
  };
}

/** `light` keeps inner pages calm: fewer flakes than on the home page. */
export default function SnowEffect({ light = false }: { light?: boolean }) {
  const { active, still, settings } = useSeasonal();
  const ref = useRef<HTMLCanvasElement>(null);
  const on = active && !still && settings.snow;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!on || !canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let flakes: Flake[] = [];
    const resize = () => {
      const sameWidth = w === window.innerWidth && flakes.length > 0;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (sameWidth) return; // a phone's address bar hiding: keep the flakes where they are
      const level = PER_LEVEL[Math.min(3, Math.max(1, settings.snow_intensity))];
      const count = Math.round(level * Math.min(1.6, Math.max(0.6, w / 700)) * (light ? 0.45 : 1));
      flakes = Array.from({ length: count }, () => makeFlake(w, h, true));
    };
    resize();
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      for (const f of flakes) {
        f.y += f.vy * dt;
        f.phase += dt * 0.9;
        const x = f.x + Math.sin(f.phase) * f.drift;
        if (f.y > h + 6) Object.assign(f, makeFlake(w, h, false));
        ctx.globalAlpha = f.alpha;
        ctx.beginPath();
        ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); };
    const onVisible = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [on, light, settings.snow_intensity]);

  if (!on) return null;
  return <canvas ref={ref} className="ny-snow" aria-hidden="true" />;
}
