import { Gift, Sparkles } from 'lucide-react';
import { resolveImageSrc } from '@/lib/storage';
import type { LoyaltyGift } from '@/lib/gastronomLoyalty';
import { formatMoney, nextLoyaltyGift, resolveLoyaltyGift } from '@/lib/gastronomLoyalty';

interface Props {
  subtotal: number;
  gifts: LoyaltyGift[];
  compact?: boolean;
}

export default function LoyaltyGiftBanner({ subtotal, gifts, compact = false }: Props) {
  const active = gifts.filter((g) => g.is_active);
  if (active.length === 0) return null;

  const current = resolveLoyaltyGift(subtotal, active);
  const next = nextLoyaltyGift(subtotal, active);
  const remaining = next ? Math.max(0, next.min_amount - subtotal) : 0;

  if (compact && !current && !next) return null;

  return (
    <div className={`rounded-2xl border overflow-hidden ${current ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50' : 'border-gray-100 bg-white'}`}>
      <div className={`p-4 space-y-3 ${compact ? 'p-3 space-y-2' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-amber-400 text-white flex items-center justify-center shrink-0">
            <Gift className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-gray-900">Подарки к заказу</p>
            <p className="text-[11px] text-gray-500">Бесплатно — сумма по товарам</p>
          </div>
        </div>

        {current ? (
          <div className="flex items-start gap-3 rounded-xl bg-white/80 border border-amber-100 p-3">
            {current.image_url ? (
              <img
                src={resolveImageSrc(current.image_url) || current.image_url}
                alt=""
                className="w-12 h-12 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 text-xl">🎁</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Ваш подарок</p>
              <p className="text-sm font-bold text-gray-900">{current.title}</p>
              {current.description && (
                <p className="text-xs text-gray-600 mt-0.5">{current.description}</p>
              )}
              <p className="text-[11px] text-amber-700 mt-1">от {formatMoney(current.min_amount)}</p>
            </div>
          </div>
        ) : next ? (
          <p className="text-sm text-gray-600">
            Добавьте товаров ещё на{' '}
            <span className="font-bold text-emerald-700">{formatMoney(remaining)}</span>
            {' '}— и получите <span className="font-semibold">{next.title}</span>
          </p>
        ) : null}

        {current && next && remaining > 0 && (
          <p className="text-xs text-gray-600 flex items-start gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Ещё <span className="font-semibold text-emerald-700">{formatMoney(remaining)}</span>
              {' '}до подарка «{next.title}» (от {formatMoney(next.min_amount)})
            </span>
          </p>
        )}

        {!compact && active.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Все уровни</p>
            {active.map((g) => {
              const reached = subtotal >= g.min_amount;
              return (
                <div
                  key={g.id}
                  className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-lg ${
                    reached ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-50 text-gray-500'
                  }`}
                >
                  <span className="truncate pr-2">{g.title}</span>
                  <span className="shrink-0 font-medium">от {formatMoney(g.min_amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
