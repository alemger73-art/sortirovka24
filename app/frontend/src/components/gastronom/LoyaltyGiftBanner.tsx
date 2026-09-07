import { Gift, Sparkles } from 'lucide-react';
import DamAlemImage from '@/components/damalem/DamAlemImage';
import type { LoyaltyGift } from '@/lib/gastronomLoyalty';
import {
  availableLoyaltyGiftChoices,
  formatMoney,
  nextLoyaltyGift,
} from '@/lib/gastronomLoyalty';

interface Props {
  subtotal: number;
  gifts: LoyaltyGift[];
  compact?: boolean;
  selectedGiftId?: string | null;
  onSelectGift?: (gift: LoyaltyGift) => void;
}

export default function LoyaltyGiftBanner({
  subtotal,
  gifts,
  compact = false,
  selectedGiftId,
  onSelectGift,
}: Props) {
  const active = gifts.filter((g) => g.is_active);
  if (active.length === 0) return null;

  const choices = availableLoyaltyGiftChoices(subtotal, active);
  const current =
    choices.find((gift) => gift.id === selectedGiftId) ??
    (choices.length === 1 ? choices[0] : null);
  const next = nextLoyaltyGift(subtotal, active);
  const nextChoiceCount = next
    ? active.filter((gift) => gift.min_amount === next.min_amount).length
    : 0;
  const remaining = next ? Math.max(0, next.min_amount - subtotal) : 0;

  if (compact && !current && !next) return null;

  return (
    <div className={`dam-loyalty-gift ${compact ? '' : 'shadow-sm'}`}>
      <div className={`p-4 space-y-3 ${compact ? 'p-3 space-y-2' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Gift className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-gray-900 tracking-tight">Подарки к заказу</p>
            <p className="text-[11px] text-gray-500">Бесплатно при достижении суммы</p>
          </div>
        </div>

        {choices.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-emerald-800">
              {choices.length > 1 ? 'Выберите один подарок бесплатно' : 'Ваш подарок добавлен бесплатно'}
            </p>
            <div className={`grid gap-2 ${choices.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {choices.map((gift) => {
                const selected = gift.id === current?.id;
                return (
                  <button
                    key={gift.id}
                    type="button"
                    onClick={() => onSelectGift?.(gift)}
                    disabled={!onSelectGift}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left shadow-sm transition ${
                      selected
                        ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100'
                        : 'border-amber-100/80 bg-white/90 hover:border-emerald-200'
                    }`}
                    aria-pressed={selected}
                  >
                    <div className="dam-loyalty-gift__thumb">
                      {gift.image_url ? (
                        <DamAlemImage src={gift.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span aria-hidden>🎁</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        {selected ? 'Выбран' : 'Выбрать'}
                      </p>
                      <p className="text-sm font-bold text-gray-900">{gift.title}</p>
                      {gift.description && (
                        <p className="mt-0.5 text-xs text-gray-600">{gift.description}</p>
                      )}
                      <p className="mt-1 text-[11px] text-amber-700">от {formatMoney(gift.min_amount)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : next ? (
          <p className="text-sm text-gray-600">
            Добавьте товаров ещё на{' '}
            <span className="font-bold text-emerald-700">{formatMoney(remaining)}</span>
            {' '}— и <span className="font-semibold">
              {nextChoiceCount > 1 ? `выберите подарок из ${nextChoiceCount} вариантов` : `получите ${next.title}`}
            </span>
          </p>
        ) : null}

        {current && next && remaining > 0 && (
          <p className="text-xs text-gray-600 flex items-start gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Ещё <span className="font-semibold text-emerald-700">{formatMoney(remaining)}</span>
              {' '}до {nextChoiceCount > 1 ? `выбора подарка (${nextChoiceCount} варианта)` : `подарка «${next.title}»`}
              {' '}(от {formatMoney(next.min_amount)})
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
