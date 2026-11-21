/** Hand-picked decorations (snowman, lantern, spruce, gift). Purely visual: hidden from screen readers, never takes taps. */
import { useSeasonal } from './SeasonalThemeProvider';

const ART = {
  snowman: { src: '/seasonal/snowman.webp', w: 420, h: 393 },
  lantern: { src: '/seasonal/lantern.webp', w: 260, h: 334 },
  spruce: { src: '/seasonal/spruce.webp', w: 900, h: 476 },
  gift: { src: '/seasonal/gift.webp', w: 300, h: 213 },
} as const;

export type DecorKind = keyof typeof ART;

export default function ChristmasDecor({ kind, className = '' }: { kind: DecorKind; className?: string }) {
  const { active } = useSeasonal();
  if (!active) return null;
  const art = ART[kind];
  return (
    <img src={art.src} width={art.w} height={art.h} alt="" aria-hidden="true" loading="lazy" decoding="async"
      className={`ny-decor ny-decor-${kind} ${className}`.trim()} />
  );
}
