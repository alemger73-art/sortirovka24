import { useStoreTranslations } from '@/i18n/storeTranslations';
import { ArrowRight, Check, Truck } from 'lucide-react';
import type { FoodPromoCode } from '@/lib/foodPromo';
import { promoChipLabel } from '@/lib/damAlemMarketing';

interface Props { promos: FoodPromoCode[]; freeDeliveryFrom: number; formatPrice: (n: number) => string; appliedCode?: string; onApply: (code: string) => void }

export default function DamAlemPromoStrip({ promos, freeDeliveryFrom, formatPrice, appliedCode, onApply }: Props) {
  const st = useStoreTranslations();

  if (!promos.length && freeDeliveryFrom <= 0) return null;
  return (
    <section className="dam-promo-strip" aria-label={st("Промокоды к заказу")}>
      <h2>{st("Выгода к заказу")}</h2>
      <div className="dam-promo-strip__track">
        {freeDeliveryFrom > 0 && <div className="dam-promo-chip"><Truck aria-hidden="true" /><span>{st("Бесплатная доставка от")} {formatPrice(freeDeliveryFrom)}</span></div>}
        {promos.map(p => {
          const active = appliedCode === p.code;
          const hint = [p.type === 'free_delivery' ? st('Бесплатная доставка') : promoChipLabel({...p, label: undefined})];
          if (p.min_order && p.min_order > 0) hint.push(st('от {0}', [formatPrice(p.min_order)]));
          if (p.type === 'percent' && p.max_discount && p.max_discount > 0) hint.push(st('Скидка до {0}', [formatPrice(p.max_discount)]));
          return <button key={p.code} type="button" className={`dam-promo-chip${active ? ' dam-promo-chip--active' : ''}`} aria-pressed={active} aria-label={st("{0} промокод {1}", [active ? st("Выбран") : st("Применить"), p.code])} onClick={() => onApply(p.code)}>
            <span className="dam-promo-chip__body"><strong>{p.code}</strong><span>{hint.join(' · ')}</span></span>
            <span className="dam-promo-chip__action">{active ? st("Выбран") : st("Выбрать")}{active ? <Check aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</span>
          </button>;
        })}
      </div>
    </section>
  );
}
