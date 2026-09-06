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
    <div className="fab-above-bottom-nav dam-floating-cart-wrap fixed inset-x-0 z-[55] mx-auto w-full max-w-lg animate-in slide-in-from-bottom px-4 duration-300">
      <button
        type="button"
        onClick={onOpen}
        data-testid="dam-floating-cart"
        className="dam-floating-cart relative flex w-full items-center justify-between gap-3 overflow-hidden active:scale-[0.99] transition-transform"
      >
        {showProgress ? (
          <span
            className="absolute inset-x-0 bottom-0 h-1 bg-[#FF3B30] transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            aria-label={progressLabel}
          />
        ) : null}
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <ShoppingBag className="h-4 w-4" />
          </span>
          <div className="min-w-0 text-left">
            <p className="truncate text-xs font-semibold text-white/60">{itemLabel}</p>
            <p className="text-base font-extrabold tracking-tight">{totalLabel}</p>
          </div>
        </div>
        <span className="dam-floating-cart__cta shrink-0">
          {cartLabel}
          <ChevronRight className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
