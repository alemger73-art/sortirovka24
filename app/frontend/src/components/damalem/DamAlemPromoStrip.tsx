import { ArrowRight, Check, Truck } from 'lucide-react';
import type { FoodPromoCode } from '@/lib/foodPromo';
import { promoChipHint } from '@/lib/damAlemMarketing';

interface Props { promos: FoodPromoCode[]; freeDeliveryFrom: number; formatPrice: (n: number) => string; appliedCode?: string; onApply: (code: string) => void }

export default function DamAlemPromoStrip({ promos, freeDeliveryFrom, formatPrice, appliedCode, onApply }: Props) {
  if (!promos.length && freeDeliveryFrom <= 0) return null;
  return (
    <section className="dam-promo-strip" aria-label="Промокоды к заказу">
      <h2>Выгода к заказу</h2>
      <div className="dam-promo-strip__track">
        {freeDeliveryFrom > 0 && <div className="dam-promo-chip"><Truck aria-hidden="true" /><span>Бесплатная доставка от {formatPrice(freeDeliveryFrom)}</span></div>}
        {promos.map(p => {
          const active = appliedCode === p.code;
          return <button key={p.code} type="button" className={`dam-promo-chip${active ? ' dam-promo-chip--active' : ''}`} aria-pressed={active} aria-label={`${active ? 'Выбран' : 'Применить'} промокод ${p.code}`} onClick={() => onApply(p.code)}>
            <span className="dam-promo-chip__body"><strong>{p.code}</strong><span>{promoChipHint(p, formatPrice)}</span></span>
            <span className="dam-promo-chip__action">{active ? 'Выбран' : 'Выбрать'}{active ? <Check aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</span>
          </button>;
        })}
      </div>
    </section>
  );
}
