import { Gift, ShoppingBag, Truck } from 'lucide-react';
import type { LoyaltyGift } from '@/lib/gastronomLoyalty';

interface Props {
  cartCount: number;
  subtotal: number;
  minOrder: number;
  freeDeliveryFrom: number;
  apartmentFreeFrom: number;
  nextGift: LoyaltyGift | null;
  formatPrice: (n: number) => string;
  onOpenCart: () => void;
}

function pickGoal(opts: {
  subtotal: number;
  minOrder: number;
  freeDeliveryFrom: number;
  apartmentFreeFrom: number;
  nextGift: LoyaltyGift | null;
  formatPrice: (n: number) => string;
}) {
  const goals: { remaining: number; target: number; label: string; icon: typeof Truck }[] = [];
  if (opts.minOrder > 0 && opts.subtotal < opts.minOrder) {
    goals.push({
      remaining: opts.minOrder - opts.subtotal,
      target: opts.minOrder,
      label: `Ещё ${opts.formatPrice(opts.minOrder - opts.subtotal)} до минимального заказа`,
      icon: ShoppingBag,
    });
  }
  if (opts.freeDeliveryFrom > 0 && opts.subtotal < opts.freeDeliveryFrom) {
    goals.push({
      remaining: opts.freeDeliveryFrom - opts.subtotal,
      target: opts.freeDeliveryFrom,
      label: opts.apartmentFreeFrom === opts.freeDeliveryFrom
        ? `Ещё ${opts.formatPrice(opts.freeDeliveryFrom - opts.subtotal)} — и доставка до квартиры бесплатная`
        : `Ещё ${opts.formatPrice(opts.freeDeliveryFrom - opts.subtotal)} до бесплатной доставки`,
      icon: Truck,
    });
  }
  if (
    opts.apartmentFreeFrom > 0 &&
    opts.apartmentFreeFrom !== opts.freeDeliveryFrom &&
    opts.subtotal < opts.apartmentFreeFrom
  ) {
    goals.push({
      remaining: opts.apartmentFreeFrom - opts.subtotal,
      target: opts.apartmentFreeFrom,
      label: `Ещё ${opts.formatPrice(opts.apartmentFreeFrom - opts.subtotal)} — поднимем до квартиры бесплатно`,
      icon: Truck,
    });
  }
  if (opts.nextGift) {
    goals.push({
      remaining: opts.nextGift.min_amount - opts.subtotal,
      target: opts.nextGift.min_amount,
      label: `Ещё ${opts.formatPrice(opts.nextGift.min_amount - opts.subtotal)} — и подарок на выбор`,
      icon: Gift,
    });
  }
  return goals.sort((a, b) => a.remaining - b.remaining)[0] ?? null;
}

export default function AlemFoodGoalsDock({
  cartCount,
  subtotal,
  minOrder,
  freeDeliveryFrom,
  apartmentFreeFrom,
  nextGift,
  formatPrice,
  onOpenCart,
}: Props) {
  if (cartCount <= 0) return null;
  const goal = pickGoal({
    subtotal,
    minOrder,
    freeDeliveryFrom,
    apartmentFreeFrom,
    nextGift,
    formatPrice,
  });
  const progress = goal ? Math.min(100, Math.round((subtotal / goal.target) * 100)) : 100;
  const Icon = goal?.icon || Truck;

  return (
    <button type="button" className="alem-goals-dock" onClick={onOpenCart}>
      <div className="alem-goals-dock__track" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="alem-goals-dock__row">
        <span className="alem-goals-dock__icon"><Icon className="h-4 w-4" /></span>
        <span className="alem-goals-dock__text">
          {goal ? goal.label : 'Все бонусы активны — оформите заказ'}
        </span>
        <span className="alem-goals-dock__cta">
          Корзина · {formatPrice(subtotal)}
        </span>
      </div>
    </button>
  );
}
