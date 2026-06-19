import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { MarketingStory } from '@/lib/damAlemMarketing';
import DamAlemImage from '@/components/damalem/DamAlemImage';

interface Props {
  stories: MarketingStory[];
  onCta?: (story: MarketingStory) => void;
}

export default function DamAlemStories({ stories, onCta }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openStory = stories.find(s => s.id === openId) ?? null;
  const openIndex = openStory ? stories.findIndex(s => s.id === openId) : -1;

  const goNext = useCallback(() => {
    if (openIndex < 0 || stories.length === 0) return;
    const next = stories[(openIndex + 1) % stories.length];
    setOpenId(next.id);
  }, [openIndex, stories]);

  useEffect(() => {
    if (!openId) return;
    const t = window.setTimeout(goNext, 5500);
    return () => window.clearTimeout(t);
  }, [openId, goNext]);

  if (stories.length === 0) return null;

  return (
    <>
      <section className="dam-animate-in">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">Акции и новости</p>
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-1 scrollbar-hide">
          {stories.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpenId(s.id)}
              className="dam-story-btn shrink-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="dam-story-ring">
                <span className="dam-story-thumb">
                  <DamAlemImage src={s.image} alt="" className="h-full w-full object-cover" />
                  <span className="dam-story-thumb__emoji">{s.emoji}</span>
                </span>
              </span>
              <span className="dam-story-label">{s.title}</span>
            </button>
          ))}
        </div>
      </section>

      {openStory && (
        <div className="dam-sheet-overlay z-[70] items-center" onClick={() => setOpenId(null)}>
          <div
            className="dam-story-viewer"
            onClick={e => e.stopPropagation()}
            style={{ background: openStory.gradient }}
          >
            <div className="dam-story-viewer__progress">
              {stories.map((s, i) => (
                <span
                  key={s.id}
                  className={`dam-story-viewer__bar ${i < openIndex ? 'dam-story-viewer__bar--done' : ''} ${s.id === openId ? 'dam-story-viewer__bar--active' : ''}`}
                />
              ))}
            </div>
            <button type="button" className="dam-story-viewer__close" onClick={() => setOpenId(null)} aria-label="Закрыть">
              <X className="h-5 w-5" />
            </button>
            <div className="dam-story-viewer__body">
              <span className="text-5xl mb-4">{openStory.emoji}</span>
              <h3 className="text-2xl font-black text-white leading-tight">{openStory.title}</h3>
              <p className="mt-3 text-base text-white/90 leading-relaxed max-w-sm">{openStory.subtitle}</p>
              {openStory.cta ? (
                <button
                  type="button"
                  className="dam-story-viewer__cta"
                  onClick={() => {
                    setOpenId(null);
                    onCta?.(openStory);
                  }}
                >
                  {openStory.cta}
                </button>
              ) : null}
            </div>
            <button type="button" className="dam-story-viewer__tap-next" onClick={goNext} aria-label="Следующая" />
          </div>
        </div>
      )}
    </>
  );
}
