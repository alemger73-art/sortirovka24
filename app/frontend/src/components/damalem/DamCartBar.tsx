import { Gift } from 'lucide-react';
import { useStoreTranslations } from '@/i18n/storeTranslations';

/** Sticky bar over the menu: what is in the cart, the total and how far the next goal is. */
export default function DamCartBar({ count, total, goal, formatPrice, onOpen }: {
  count: number;
  /** Food plus the service fee: the same money the order screen starts from. */
  total: number;
  goal: { label: string; progress: number } | null;
  formatPrice: (n: number) => string;
  onOpen: () => void;
}) {
  const st = useStoreTranslations();
  if (count <= 0) return null;
  return <button type="button" className="dam-cart-bar" onClick={onOpen} data-testid="dam-cart-bar">
    <span className="dam-cart-bar__row">
      <span className="dam-cart-bar__sum">
        <small>{st('Корзина · {0}', [count])}</small>
        <strong>{formatPrice(total)}</strong>
      </span>
      <span className="dam-cart-bar__cta">{st('Оформить')}</span>
    </span>
    {goal ? <span className="dam-cart-bar__goal">
      <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="dam-cart-bar__track" aria-hidden="true"><span style={{ width: `${goal.progress}%` }} /></span>
      <span>{goal.label}</span>
    </span> : null}
  </button>;
}
