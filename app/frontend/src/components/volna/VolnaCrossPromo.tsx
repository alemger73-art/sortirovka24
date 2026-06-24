import { Link } from 'react-router-dom';
import { ChevronRight, UtensilsCrossed } from 'lucide-react';
import { buildVolnaCrossPromos } from '@/lib/volnaMarketing';
import VolnaImage from '@/components/volna/VolnaImage';

interface Props {
  /** home — carousel strip; cart — compact; success — after order */
  variant?: 'home' | 'cart' | 'success';
}

export default function VolnaCrossPromo({ variant = 'home' }: Props) {
  const promos = buildVolnaCrossPromos();
  const primary = promos[0];
  const secondary = promos[1];

  if (variant === 'success') {
    return (
      <Link
        to={secondary.href}
        className="block overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4 text-left shadow-sm transition hover:shadow-md"
      >
        <div className="flex gap-3 items-center">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
            <VolnaImage src={secondary.image} kind="category" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600">DAM ALEM × VOLNA</p>
            <p className="font-bold text-gray-900">{secondary.title}</p>
            <p className="text-xs text-gray-600 mt-0.5">{secondary.subtitle}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-orange-500" />
        </div>
      </Link>
    );
  }

  if (variant === 'cart') {
    return (
      <Link
        to={primary.href}
        className="flex gap-3 overflow-hidden rounded-2xl border border-violet-100 bg-white p-3 shadow-sm transition hover:border-orange-200"
      >
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">
          <VolnaImage src={primary.image} kind="category" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center gap-1.5 text-orange-600">
            <UtensilsCrossed className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Рекомендуем</span>
          </div>
          <p className="font-bold text-sm text-gray-900 mt-0.5">{primary.title}</p>
          <p className="text-xs text-gray-500 line-clamp-2">{primary.subtitle}</p>
          <p className="text-xs font-semibold text-orange-600 mt-1">{primary.cta} →</p>
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-gray-900">К заказу из VOLNA</h2>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600">DAM ALEM</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {promos.slice(0, 2).map((promo) => (
          <Link
            key={promo.id}
            to={promo.href}
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 p-4 min-h-[120px] shadow-md transition hover:shadow-lg"
          >
            <VolnaImage
              src={promo.image}
              kind="category"
              className="absolute right-0 top-0 h-full w-2/5 object-cover opacity-35 rounded-l-2xl transition group-hover:opacity-45"
            />
            {promo.badge && (
              <span className="relative z-10 inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white mb-2">
                {promo.badge}
              </span>
            )}
            <p className="relative z-10 font-bold text-white text-base">{promo.title}</p>
            <p className="relative z-10 text-orange-100 text-sm mt-1 line-clamp-2">{promo.subtitle}</p>
            <p className="relative z-10 text-white/90 text-xs font-semibold mt-2">{promo.cta} →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
