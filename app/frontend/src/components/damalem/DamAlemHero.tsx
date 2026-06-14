import { Clock, Star, Truck, Utensils } from 'lucide-react';
import { DAM_ALEM_BRAND, DAM_ALEM_HERO_FALLBACK } from '@/lib/damAlem';

interface PromoSlide {
  title: string;
  lines: string[];
}

interface DamAlemHeroProps {
  title: string;
  subtitle: string;
  heroImage?: string;
  minOrder: number;
  deliveryFrom: number;
  promoSlide: number;
  promoSlides: PromoSlide[];
  onPromoSlideChange: (index: number) => void;
  formatPrice: (n: number) => string;
}

export default function DamAlemHero({
  title,
  subtitle,
  heroImage,
  minOrder,
  deliveryFrom,
  promoSlide,
  promoSlides,
  onPromoSlideChange,
  formatPrice,
}: DamAlemHeroProps) {
  const bg = (heroImage || '').trim() || DAM_ALEM_HERO_FALLBACK;
  const slide = promoSlides[promoSlide] ?? promoSlides[0];

  return (
    <section className="relative mx-auto max-w-lg overflow-hidden rounded-b-[28px] shadow-xl md:max-w-3xl lg:max-w-5xl">
      <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/25" />
      <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-[#FF3B30]/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-8 h-48 w-48 rounded-full bg-amber-500/20 blur-3xl" />

      <div className="relative z-10 px-5 pb-8 pt-6 md:px-8 md:pb-10 md:pt-8">
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-md">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FF3B30] text-white shadow-lg shadow-[#FF3B30]/40">
              <Utensils className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-white">{title || DAM_ALEM_BRAND}</span>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-[#111111] shadow-sm">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            4.9
          </div>
        </div>

        <h1 className="mt-5 max-w-xl text-[28px] font-black leading-[1.05] tracking-tight text-white md:text-4xl">
          {subtitle || 'Доставка еды №1 в Сортировке'}
        </h1>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            <Clock className="h-3.5 w-3.5 opacity-90" />
            40–60 мин
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            <Truck className="h-3.5 w-3.5 opacity-90" />
            от {formatPrice(deliveryFrom)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            Мин. {formatPrice(minOrder)}
          </span>
        </div>

        {slide && (
          <div className="mt-6 rounded-2xl border border-white/15 bg-black/35 p-4 backdrop-blur-md">
            <p className="text-sm font-bold text-white">{slide.title}</p>
            <ul className="mt-3 space-y-2">
              {slide.lines.map(line => (
                <li key={line} className="flex items-center gap-2.5 text-sm text-white/90">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF3B30]" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              {promoSlides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Акция ${i + 1}`}
                  onClick={() => onPromoSlideChange(i)}
                  className={`h-2 rounded-full transition-all ${i === promoSlide ? 'w-7 bg-white' : 'w-2 bg-white/35 hover:bg-white/55'}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
