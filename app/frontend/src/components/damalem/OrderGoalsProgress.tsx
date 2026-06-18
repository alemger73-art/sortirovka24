import { Gift, ShoppingBag, Truck } from 'lucide-react';
import type { LoyaltyGift } from '@/lib/gastronomLoyalty';

function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}

interface Goal {
  id: string;
  icon: typeof Truck;
  label: string;
  remaining: number;
  target: number;
  reached: boolean;
  accent: 'red' | 'emerald' | 'amber';
}

interface Props {
  subtotal: number;
  minOrder: number;
  freeDeliveryFrom: number;
  nextGift: LoyaltyGift | null;
  compact?: boolean;
}

/** One bar for the nearest unreached goal: min order, free delivery, or gift. */
export default function OrderGoalsProgress({
  subtotal,
  minOrder,
  freeDeliveryFrom,
  nextGift,
  compact = false,
}: Props) {
  const goals: Goal[] = [];

  if (minOrder > 0 && subtotal < minOrder) {
    goals.push({
      id: 'min',
      icon: ShoppingBag,
      label: `Ещё ${formatMoney(minOrder - subtotal)} до минимального заказа`,
      remaining: minOrder - subtotal,
      target: minOrder,
      reached: false,
      accent: 'amber',
    });
  }

  if (freeDeliveryFrom > 0 && subtotal < freeDeliveryFrom) {
    goals.push({
      id: 'delivery',
      icon: Truck,
      label: `Ещё ${formatMoney(freeDeliveryFrom - subtotal)} до бесплатной доставки`,
      remaining: freeDeliveryFrom - subtotal,
      target: freeDeliveryFrom,
      reached: false,
      accent: 'red',
    });
  }

  if (nextGift && subtotal < nextGift.min_amount) {
    goals.push({
      id: 'gift',
      icon: Gift,
      label: `Ещё ${formatMoney(nextGift.min_amount - subtotal)} — ${nextGift.title}`,
      remaining: nextGift.min_amount - subtotal,
      target: nextGift.min_amount,
      reached: false,
      accent: 'emerald',
    });
  }

  const active = goals.sort((a, b) => a.remaining - b.remaining)[0];
  if (!active) {
    if (compact) return null;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
        Все бонусы активны — оформляйте заказ!
      </div>
    );
  }

  const progress = Math.min(100, Math.round((subtotal / active.target) * 100));
  const barColor =
    active.accent === 'red'
      ? 'bg-gradient-to-r from-[#FF3B30] to-orange-400'
      : active.accent === 'amber'
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  const Icon = active.icon;

  return (
    <div className={`overflow-hidden rounded-2xl border border-gray-100 bg-white ${compact ? 'p-3' : 'p-4'} shadow-sm`}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF3B30]/10 text-[#FF3B30]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#111111]">{active.label}</p>
          {!compact && (
            <p className="text-xs text-[#777777] mt-0.5">
              {formatMoney(subtotal)} из {formatMoney(active.target)}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
