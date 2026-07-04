import { Copy, Tag, Truck } from 'lucide-react';
import type { FoodPromoCode } from '@/lib/foodPromo';
import { promoChipHint } from '@/lib/damAlemMarketing';

interface Props {
  promos: FoodPromoCode[];
  freeDeliveryFrom: number;
  formatPrice: (n: number) => string;
  appliedCode?: string;
  onApply: (code: string) => void;
}

export default function DamAlemPromoStrip({
  promos,
  freeDeliveryFrom,
  formatPrice,
  appliedCode,
  onApply,
}: Props) {
  const copyAndApply = (code: string) => {
    void navigator.clipboard?.writeText(code).catch(() => {});
    onApply(code);
  };

  return (
    <section className="dam-promo-strip dam-animate-in">
      <div className="flex items-center gap-2 mb-3 lg:mb-4">
        <Tag className="h-5 w-5 text-[#FF3B30]" />
        <h2 className="dam-section-title text-zinc-900">Выгодно сегодня</h2>
      </div>

      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-0.5 lg:gap-3">
        {freeDeliveryFrom > 0 && (
          <div className="dam-promo-chip dam-promo-chip--delivery shrink-0">
            <Truck className="h-5 w-5" />
            <div>
              <p className="text-sm font-bold lg:text-base">Бесплатная доставка</p>
              <p className="text-xs opacity-90 lg:text-sm">от {formatPrice(freeDeliveryFrom)}</p>
            </div>
          </div>
        )}

        {promos.map(p => {
          const active = appliedCode === p.code;
          return (
            <button
              key={p.code}
              type="button"
              onClick={() => copyAndApply(p.code)}
              className={`dam-promo-chip dam-promo-chip--code shrink-0 ${active ? 'dam-promo-chip--active' : ''}`}
            >
              <span className="dam-promo-chip__code">{p.code}</span>
              <span className="text-xs font-semibold opacity-90 lg:text-sm">{promoChipHint(p, formatPrice)}</span>
              <Copy className="h-3.5 w-3.5 opacity-60 ml-1" />
            </button>
          );
        })}

        {promos.length === 0 && freeDeliveryFrom <= 0 && (
          <p className="text-xs text-zinc-500 px-1">Следите за акциями — промокоды появятся здесь</p>
        )}
      </div>
    </section>
  );
}
