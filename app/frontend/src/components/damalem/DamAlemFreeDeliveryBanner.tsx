import { Truck } from 'lucide-react';

interface Props {
  freeDeliveryFrom: number;
  minOrder: number;
  formatPrice: (n: number) => string;
}

export default function DamAlemFreeDeliveryBanner({ freeDeliveryFrom, minOrder, formatPrice }: Props) {
  if (freeDeliveryFrom <= 0) return null;

  return (
    <div className="dam-free-banner dam-animate-in">
      <div className="dam-free-banner__shimmer" />
      <div className="relative z-10 flex items-center gap-3 p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
          <Truck className="h-6 w-6 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white leading-tight">
            Бесплатная доставка от {formatPrice(freeDeliveryFrom)}
          </p>
          <p className="mt-0.5 text-xs text-white/80">
            {minOrder > 0
              ? `Мин. заказ ${formatPrice(minOrder)} · 35–45 мин · Сортировка`
              : 'Доставим горячим прямо к подъезду'}
          </p>
        </div>
      </div>
    </div>
  );
}
