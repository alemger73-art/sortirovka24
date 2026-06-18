import { ChevronRight, ShoppingBag } from 'lucide-react';

interface Props {
  itemLabel: string;
  totalLabel: string;
  cartLabel: string;
  onOpen: () => void;
}

export default function DamAlemFloatingCart({ itemLabel, totalLabel, cartLabel, onOpen }: Props) {
  return (
    <div className="fab-above-bottom-nav fixed left-4 right-4 z-[55] mx-auto max-w-lg animate-in slide-in-from-bottom duration-300 md:max-w-3xl lg:max-w-5xl">
      <button type="button" onClick={onOpen} className="dam-floating-cart flex w-full items-center justify-between gap-3 active:scale-[0.99] transition-transform">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div className="text-left min-w-0">
            <p className="text-sm font-bold truncate">{itemLabel}</p>
            <p className="text-lg font-extrabold tracking-tight">{totalLabel}</p>
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
