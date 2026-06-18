import { Truck, Sparkles } from 'lucide-react';

function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}

interface Props {
  subtotal: number;
  freeFrom: number;
  compact?: boolean;
}

/** Progress bar: «осталось X ₸ до бесплатной доставки». */
export default function FreeDeliveryProgress({ subtotal, freeFrom, compact = false }: Props) {
  if (!freeFrom || freeFrom <= 0) return null;

  const reached = subtotal >= freeFrom;
  const remaining = Math.max(0, freeFrom - subtotal);
  const progress = Math.min(100, Math.round((subtotal / freeFrom) * 100));

  if (compact && reached) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
        <Sparkles className="h-4 w-4 shrink-0" />
        Бесплатная доставка активна!
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        reached ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50' : 'border-red-100 bg-gradient-to-r from-red-50 to-orange-50'
      }`}
    >
      <div className={compact ? 'p-3 space-y-2' : 'p-4 space-y-3'}>
        <div className="flex items-start gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              reached ? 'bg-emerald-500 text-white' : 'bg-[#FF3B30] text-white'
            }`}
          >
            <Truck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            {reached ? (
              <>
                <p className="text-sm font-bold text-emerald-900">Бесплатная доставка!</p>
                <p className="text-xs text-emerald-700">Заказ от {formatMoney(freeFrom)} — доставим без доплаты</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-[#111111]">
                  Ещё <span className="text-[#FF3B30]">{formatMoney(remaining)}</span> до бесплатной доставки
                </p>
                <p className="text-xs text-[#777777]">При заказе от {formatMoney(freeFrom)}</p>
              </>
            )}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-black/5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              reached ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#FF3B30] to-orange-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {!reached && !compact && (
          <p className="text-center text-[11px] text-[#999999]">
            {formatMoney(subtotal)} из {formatMoney(freeFrom)}
          </p>
        )}
      </div>
    </div>
  );
}
