import { Clock, Truck, UtensilsCrossed } from 'lucide-react';

interface Props {
  kitchenOpen: boolean;
  kitchenMessage?: string;
  deliveryTime: string;
  freeDeliveryLabel?: string;
  offerLabel?: string;
}

/** Compact sticky status: kitchen · ETA · free delivery / offer */
export default function DamAlemStatusStrip({
  kitchenOpen,
  kitchenMessage,
  deliveryTime,
  freeDeliveryLabel,
  offerLabel,
}: Props) {
  if (!kitchenOpen) {
    return (
      <div className="dam-status-strip dam-status-strip--closed" role="status">
        <UtensilsCrossed className="h-4 w-4 shrink-0" />
        <p className="min-w-0 truncate text-sm font-semibold">
          {kitchenMessage || 'Кухня закрыта · приём заказов недоступен'}
        </p>
      </div>
    );
  }

  return (
    <div className="dam-status-strip" role="status">
      <span className="dam-status-strip__dot" aria-hidden />
      <span className="dam-status-strip__item">
        <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" />
        {deliveryTime}
      </span>
      {freeDeliveryLabel ? (
        <>
          <span className="dam-status-strip__sep" aria-hidden>
            ·
          </span>
          <span className="dam-status-strip__item">
            <Truck className="h-3.5 w-3.5 shrink-0 opacity-80" />
            {freeDeliveryLabel}
          </span>
        </>
      ) : null}
      {offerLabel ? (
        <>
          <span className="dam-status-strip__sep" aria-hidden>
            ·
          </span>
          <span className="dam-status-strip__offer truncate">{offerLabel}</span>
        </>
      ) : null}
    </div>
  );
}
