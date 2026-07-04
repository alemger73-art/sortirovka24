import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

  const close = useCallback(() => setOpenId(null), []);

  const goNext = useCallback(() => {
    if (openIndex < 0 || stories.length === 0) return;
    const next = stories[(openIndex + 1) % stories.length];
    setOpenId(next.id);
  }, [openIndex, stories]);

  const goPrev = useCallback(() => {
    if (openIndex < 0 || stories.length === 0) return;
    if (openIndex === 0) {
      close();
      return;
    }
    setOpenId(stories[openIndex - 1].id);
  }, [openIndex, stories, close]);

  useEffect(() => {
    if (!openId) return;
    const t = window.setTimeout(goNext, 5500);
    return () => window.clearTimeout(t);
  }, [openId, goNext]);

  useEffect(() => {
    if (!openId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [openId]);

  if (stories.length === 0) return null;

  const viewer = openStory
    ? createPortal(
        <div
          className="dam-story-overlay"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={openStory.title}
        >
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

            <button
              type="button"
              className="dam-story-viewer__tap-zone dam-story-viewer__tap-zone--prev"
              onClick={goPrev}
              aria-label="Предыдущая"
            />
            <button
              type="button"
              className="dam-story-viewer__tap-zone dam-story-viewer__tap-zone--next"
              onClick={goNext}
              aria-label="Следующая"
            />

            <button
              type="button"
              className="dam-story-viewer__close"
              onClick={close}
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="dam-story-viewer__body">
              <span className="text-5xl mb-4" aria-hidden>{openStory.emoji}</span>
              <h3 className="text-2xl font-black text-white leading-tight">{openStory.title}</h3>
              <p className="mt-3 text-base text-white/90 leading-relaxed max-w-sm">{openStory.subtitle}</p>
              {openStory.cta ? (
                <button
                  type="button"
                  className="dam-story-viewer__cta"
                  onClick={e => {
                    e.stopPropagation();
                    close();
                    onCta?.(openStory);
                  }}
                >
                  {openStory.cta}
                </button>
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <section className="dam-animate-in">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 lg:mb-4 lg:text-sm">Акции и новости</p>
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-1 scrollbar-hide lg:gap-5">
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
      {viewer}
    </>
  );
}
