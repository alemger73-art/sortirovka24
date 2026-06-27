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

  return (
    <section className="relative mx-auto max-w-lg overflow-hidden md:max-w-3xl lg:max-w-6xl dam-hero-desktop">
      <div className="relative aspect-[16/10] min-h-[220px] max-h-[320px] sm:aspect-[21/9]">
        <DamAlemImage
          src={bg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          fallbacks={[DAM_ALEM_CDN.hero, DAM_ALEM_CDN.food]}
        />
        <div className="dam-hero-gradient absolute inset-0" />
        <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-[#FF3B30]/25 blur-3xl" />

        <div className="relative z-10 flex h-full flex-col justify-end p-5 md:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md">
                {title || DAM_ALEM_BRAND}
              </div>
              <h1 className="max-w-md text-2xl font-black leading-[1.08] tracking-tight text-white sm:text-3xl md:text-4xl">
                {subtitle || 'Горячая еда с доставкой'}
              </h1>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-zinc-900 shadow-lg">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {rating.toFixed(1)}
              </div>
              {cartCount > 0 && onOpenCart ? (
                <button
                  type="button"
                  onClick={onOpenCart}
                  className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-zinc-900 shadow-lg active:scale-95 transition"
                  aria-label={`Корзина: ${cartCount}`}
                >
                  <ShoppingBag className="h-5 w-5" />
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold text-white">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-black/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              <Clock className="h-3.5 w-3.5" />
              {deliveryTime}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-black/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              <Truck className="h-3.5 w-3.5" />
              от {formatPrice(deliveryFrom)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-black/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              мин. {formatPrice(minOrder)}
            </span>
          </div>

          {slide && promoSlides.length > 0 && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3.5 backdrop-blur-md">
              <p className="text-sm font-bold text-white">{slide.title}</p>
              {slide.lines[0] ? <p className="mt-1 text-xs text-white/70 line-clamp-2">{slide.lines[0]}</p> : null}
              {promoSlides.length > 1 && (
                <div className="mt-2.5 flex gap-1">
                  {promoSlides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Слайд ${i + 1}`}
                      onClick={() => onPromoSlideChange(i)}
                      className={`h-1.5 rounded-full transition-all ${i === promoSlide ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
