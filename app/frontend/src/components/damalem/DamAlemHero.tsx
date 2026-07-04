import { Clock, ShoppingBag, Star, Truck } from 'lucide-react';
import { DAM_ALEM_BRAND, DAM_ALEM_HERO_FALLBACK } from '@/lib/damAlem';
import { resolveImageSrc } from '@/lib/storage';
import DamAlemImage from '@/components/damalem/DamAlemImage';
import { DAM_ALEM_CDN } from '@/lib/damAlemImages';

interface PromoSlide {
  title: string;
  lines: string[];
}

interface DamAlemHeroProps {
  title: string;
  subtitle: string;
  heroImage?: string;
  brandPhoto?: string;
  rating?: number;
  deliveryTime?: string;
  minOrder: number;
  deliveryFrom: number;
  promoSlide: number;
  promoSlides: PromoSlide[];
  onPromoSlideChange: (index: number) => void;
  formatPrice: (n: number) => string;
  cartCount?: number;
  onOpenCart?: () => void;
}

export default function DamAlemHero({
  title,
  subtitle,
  heroImage,
  brandPhoto,
  rating = 4.9,
  deliveryTime = '35–45 мин',
  minOrder,
  deliveryFrom,
  promoSlide,
  promoSlides,
  onPromoSlideChange,
  formatPrice,
  cartCount = 0,
  onOpenCart,
}: DamAlemHeroProps) {
  const bg =
    resolveImageSrc(heroImage || '') ||
    resolveImageSrc(brandPhoto || '') ||
    (heroImage || '').trim() ||
    DAM_ALEM_HERO_FALLBACK;
  const slide = promoSlides[promoSlide] ?? promoSlides[0];
  const brandLabel = title || DAM_ALEM_BRAND;
  const headline = subtitle || 'Горячая еда с доставкой';

  return (
    <section className="dam-hero-bleed dam-hero-desktop" aria-label={brandLabel}>
      <div className="dam-hero-media">
        <DamAlemImage
          src={bg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          fallbacks={[DAM_ALEM_CDN.hero, DAM_ALEM_CDN.food]}
        />
        <div className="dam-hero-gradient-top" aria-hidden />
        <div className="dam-hero-gradient absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-[#FF3B30]/20 blur-3xl lg:h-96 lg:w-96" />

        <div className="dam-hero-inner relative z-10 flex h-full flex-col justify-between gap-4 px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6 lg:gap-6 lg:px-10 lg:pb-8 lg:pt-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2.5 lg:space-y-3">
              <span className="dam-hero-brand-mark">{DAM_ALEM_BRAND}</span>
              <p className="dam-hero-tagline">{brandLabel}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2.5">
              <div className="dam-hero-rating">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400 lg:h-5 lg:w-5" />
                {rating.toFixed(1)}
              </div>
              {cartCount > 0 && onOpenCart ? (
                <button
                  type="button"
                  onClick={onOpenCart}
                  className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zinc-900 shadow-lg active:scale-95 transition lg:h-14 lg:w-14"
                  aria-label={`Корзина: ${cartCount}`}
                >
                  <ShoppingBag className="h-5 w-5 lg:h-6 lg:w-6" />
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold text-white lg:h-6 lg:min-w-[1.5rem] lg:text-xs">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-auto space-y-4 lg:space-y-5">
            <h1 className="dam-hero-headline">{headline}</h1>

            <div className="flex flex-wrap gap-2 lg:gap-2.5">
              <span className="dam-hero-chip">
                <Clock className="h-4 w-4 shrink-0 lg:h-[1.125rem] lg:w-[1.125rem]" />
                {deliveryTime}
              </span>
              <span className="dam-hero-chip">
                <Truck className="h-4 w-4 shrink-0 lg:h-[1.125rem] lg:w-[1.125rem]" />
                от {formatPrice(deliveryFrom)}
              </span>
              <span className="dam-hero-chip">
                мин. {formatPrice(minOrder)}
              </span>
            </div>

            {slide && promoSlides.length > 0 && (
              <div className="dam-hero-promo max-w-xl">
                <p className="text-base font-bold text-white lg:text-lg">{slide.title}</p>
                {slide.lines[0] ? (
                  <p className="mt-1.5 text-sm text-white/80 line-clamp-2 lg:text-base">{slide.lines[0]}</p>
                ) : null}
                {promoSlides.length > 1 && (
                  <div className="mt-3 flex gap-1.5">
                    {promoSlides.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Слайд ${i + 1}`}
                        onClick={() => onPromoSlideChange(i)}
                        className={`h-1.5 rounded-full transition-all ${i === promoSlide ? 'w-7 bg-white' : 'w-1.5 bg-white/40'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
