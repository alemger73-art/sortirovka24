import { Link } from 'react-router-dom';
import PromoBannerMedia from '@/components/PromoBannerMedia';
import { ChevronRight, Sparkles } from 'lucide-react';

export interface FoodBanner {
  id: number;
  title: string;
  subtitle?: string;
  image_url?: string;
  button_text?: string;
  button_url?: string;
}

interface DamAlemPromoBannersProps {
  banners: FoodBanner[];
}

const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #FF3B30 0%, #C41E14 100%)',
  'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
  'linear-gradient(135deg, #059669 0%, #10B981 100%)',
];

export default function DamAlemPromoBanners({ banners }: DamAlemPromoBannersProps) {
  if (banners.length === 0) return null;

  return (
    <section className="space-y-3 dam-animate-in">
      <div className="flex items-center justify-between">
        <h2 className="dam-section-title flex items-center gap-2 text-zinc-900">
          <Sparkles className="h-5 w-5 text-[#FF3B30]" />
          Спецпредложения
        </h2>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory lg:gap-4">
        {banners.map((b, idx) => {
          const inner = (
            <article className="dam-promo-banner group snap-start">
              {b.image_url ? (
                <PromoBannerMedia
                  imageUrl={b.image_url}
                  title={b.title}
                  alt={b.title}
                  className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-110"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: FALLBACK_GRADIENTS[idx % FALLBACK_GRADIENTS.length] }}
                />
              )}
              <div className="dam-promo-banner__overlay" />
              <div className="relative z-10 flex h-full flex-col justify-end p-5 lg:p-6">
                {b.button_text && (
                  <span className="mb-2 inline-flex w-fit rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#FF3B30] shadow-sm lg:text-xs">
                    {b.button_text}
                  </span>
                )}
                <h3 className="line-clamp-2 text-lg font-black leading-snug text-white drop-shadow-sm lg:text-xl">{b.title}</h3>
                {b.subtitle && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-white/85 lg:text-base">{b.subtitle}</p>
                )}
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm w-fit lg:text-sm">
                  Подробнее <ChevronRight className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                </span>
              </div>
            </article>
          );

          const url = b.button_url || '/food';
          if (url.startsWith('/')) {
            return <Link key={b.id} to={url} className="shrink-0">{inner}</Link>;
          }
          return (
            <a key={b.id} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              {inner}
            </a>
          );
        })}
      </div>
    </section>
  );
}
