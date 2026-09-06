import { ChevronRight, ShoppingBag } from 'lucide-react';

interface Props {
  itemLabel: string;
  totalLabel: string;
  cartLabel: string;
  onOpen: () => void;
  /** Nearest goal progress 0–100 */
  progressPercent?: number;
  progressLabel?: string;
}

export default function DamAlemFloatingCart({
  itemLabel,
  totalLabel,
  cartLabel,
  onOpen,
  progressPercent,
  progressLabel,
}: Props) {
  const showProgress = typeof progressPercent === 'number' && progressLabel;

  return (
    <div className="fab-above-bottom-nav dam-floating-cart-wrap fixed inset-x-0 z-[55] mx-auto w-full max-w-[1680px] animate-in slide-in-from-bottom px-4 duration-300 sm:px-6 lg:px-10">
      <button
        type="button"
        onClick={onOpen}
        data-testid="dam-floating-cart"
        className="dam-floating-cart flex w-full flex-col gap-2 active:scale-[0.99] transition-transform"
      >
        {showProgress ? (
          <div className="w-full min-w-0">
            <p className="mb-1 truncate text-left text-[11px] font-semibold text-white/75">{progressLabel}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FF3B30] to-[#FF8C42] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-bold">{itemLabel}</p>
              <p className="text-lg font-extrabold tracking-tight">{totalLabel}</p>
            </div>
          </div>
          <span className="dam-floating-cart__cta shrink-0">
            {cartLabel}
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </button>
    </div>
  );
}
