import { Clock, Sparkles, Truck, UtensilsCrossed } from 'lucide-react';

interface Props {
  deliveryTime: string;
  minOrderLabel: string;
  freeDeliveryLabel?: string;
  kitchenOpen: boolean;
  kitchenMessage?: string;
}

export default function DamAlemTrustBar({
  deliveryTime,
  minOrderLabel,
  freeDeliveryLabel,
  kitchenOpen,
  kitchenMessage,
}: Props) {
  if (!kitchenOpen) {
    return (
      <div className="dam-card flex items-start gap-3 border-amber-200 bg-amber-50 p-4">
        <UtensilsCrossed className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-900">Кухня закрыта</p>
          <p className="mt-0.5 text-xs text-amber-800">{kitchenMessage || 'Приём заказов временно недоступен'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
      <span className="dam-trust-pill">
        <Clock className="h-3.5 w-3.5 text-[#FF3B30]" />
        {deliveryTime}
      </span>
      <span className="dam-trust-pill">
        <Truck className="h-3.5 w-3.5 text-emerald-600" />
        {minOrderLabel}
      </span>
      {freeDeliveryLabel ? (
        <span className="dam-trust-pill">
          <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          {freeDeliveryLabel}
        </span>
      ) : null}
    </div>
  );
}
