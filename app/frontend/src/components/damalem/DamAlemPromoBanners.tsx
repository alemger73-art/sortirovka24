import PromoBannerMedia from '@/components/PromoBannerMedia';
import { ChevronRight, Sparkles } from 'lucide-react';
import {
  foodBannerCtaLabel,
  resolveFoodBannerAction,
  type FoodBannerAction,
} from '@/lib/damAlemMarketing';

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
  onAction: (action: FoodBannerAction, banner: FoodBanner) => void;
}

const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #FF3B30 0%, #C41E14 100%)',
  'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
  'linear-gradient(135deg, #059669 0%, #10B981 100%)',
];

export default function DamAlemPromoBanners({ banners, onAction }: DamAlemPromoBannersProps) {
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
          const action = resolveFoodBannerAction(b);
          const ctaLabel = foodBannerCtaLabel(action, b.button_text);

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onAction(action, b)}
              className="dam-promo-banner group shrink-0 snap-start text-left"
            >
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
                {b.button_text && action.type !== 'promo' ? (
                  <span className="mb-2 inline-flex w-fit rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#FF3B30] shadow-sm lg:text-xs">
                    {b.button_text}
                  </span>
                ) : null}
                {action.type === 'promo' ? (
                  <span className="mb-2 inline-flex w-fit rounded-full bg-white/95 px-3 py-1 font-mono text-[11px] font-bold tracking-wide text-[#FF3B30] shadow-sm lg:text-xs">
                    {action.code}
                  </span>
                ) : null}
                <h3 className="line-clamp-2 text-lg font-black leading-snug text-white drop-shadow-sm lg:text-xl">{b.title}</h3>
                {b.subtitle && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-white/85 lg:text-base">{b.subtitle}</p>
                )}
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm w-fit transition group-hover:bg-white/25 lg:text-sm">
                  {ctaLabel} <ChevronRight className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
