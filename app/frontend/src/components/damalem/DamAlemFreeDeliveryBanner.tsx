import { Truck } from 'lucide-react';

interface Props {
  freeDeliveryFrom: number;
  minOrder: number;
  formatPrice: (n: number) => string;
  deliveryTime?: string;
}

export default function DamAlemFreeDeliveryBanner({ freeDeliveryFrom, minOrder, formatPrice, deliveryTime = '35–45 мин' }: Props) {
  if (freeDeliveryFrom <= 0) return null;

  return (
    <div className="dam-free-banner dam-animate-in">
      <div className="dam-free-banner__shimmer" />
      <div className="dam-free-banner__content">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm lg:h-14 lg:w-14">
          <Truck className="h-6 w-6 text-white lg:h-7 lg:w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="dam-free-banner__title">
            Бесплатная доставка от {formatPrice(freeDeliveryFrom)}
          </p>
          <p className="dam-free-banner__sub">
            {minOrder > 0
              ? `Мин. заказ ${formatPrice(minOrder)} · ${deliveryTime} · Сортировка`
              : 'Доставим горячим прямо к подъезду'}
          </p>
        </div>
      </div>
    </div>
  );
}
