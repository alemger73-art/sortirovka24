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
      <div className="flex items-center gap-2 mb-3">
        <Tag className="h-4 w-4 text-[#FF3B30]" />
        <h2 className="text-sm font-extrabold text-zinc-900">Выгодно сегодня</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
        {freeDeliveryFrom > 0 && (
          <div className="dam-promo-chip dam-promo-chip--delivery shrink-0">
            <Truck className="h-4 w-4" />
            <div>
              <p className="text-xs font-bold">Бесплатная доставка</p>
              <p className="text-[10px] opacity-90">от {formatPrice(freeDeliveryFrom)}</p>
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
              <span className="text-[10px] font-semibold opacity-90">{promoChipHint(p, formatPrice)}</span>
              <Copy className="h-3 w-3 opacity-60 ml-1" />
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
