import { ChevronRight, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import DamAlemImage from '@/components/damalem/DamAlemImage';
import DamAlemCheckoutButton from '@/components/damalem/DamAlemCheckoutButton';
import OrderGoalsProgress from '@/components/damalem/OrderGoalsProgress';
import type { LoyaltyGift } from '@/lib/gastronomLoyalty';

interface CartLine {
  name: string;
  quantity: number;
  linePrice: number;
  image?: string;
  modifiers?: string;
}

interface Props {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  serviceFeeLabel: string;
  serviceFeeAmount: number;
  totalWithService: number;
  minOrder: number;
  freeDeliveryFrom: number;
  nextGift: LoyaltyGift | null;
  formatPrice: (n: number) => string;
  checkoutLabel: string;
  onOpenCart: () => void;
  onCheckout: () => void;
  onUpdateQty?: (index: number, delta: number) => void;
  onRemoveLine?: (index: number) => void;
}

export default function DamAlemCartSidebar({
  lines,
  itemCount,
  subtotal,
  serviceFeeLabel,
  serviceFeeAmount,
  totalWithService,
  minOrder,
  freeDeliveryFrom,
  nextGift,
  formatPrice,
  checkoutLabel,
  onOpenCart,
  onCheckout,
  onUpdateQty,
  onRemoveLine,
}: Props) {
  const belowMin = minOrder > 0 && subtotal < minOrder;

  return (
    <aside className="dam-cart-sidebar hidden lg:block">
      <div className="dam-cart-sidebar__inner">
        <div className="dam-cart-sidebar__head">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF3B30]/10 text-[#FF3B30]">
              <ShoppingBag className="h-4 w-4" />
            </span>
            <div>
              <p className="dam-cart-sidebar__title">Ваш заказ</p>
              <p className="dam-cart-sidebar__meta">{itemCount} {itemCount === 1 ? 'позиция' : itemCount < 5 ? 'позиции' : 'позиций'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenCart}
            className="text-xs font-bold text-[#FF3B30] hover:underline"
          >
            Открыть
          </button>
        </div>

        <div className="dam-cart-sidebar__lines">
          {lines.map((line, idx) => (
            <div key={`${line.name}-${idx}`} className="dam-cart-sidebar__line">
              <div className="dam-cart-sidebar__line-media">
                <DamAlemImage src={line.image || ''} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold leading-snug text-zinc-900 line-clamp-2">{line.name}</p>
                  {onRemoveLine ? (
                    <button
                      type="button"
                      onClick={() => onRemoveLine(idx)}
                      className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      aria-label="Удалить"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                {line.modifiers ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-[#FF3B30] line-clamp-1">{line.modifiers}</p>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold tabular-nums">{formatPrice(line.linePrice)}</span>
                  {onUpdateQty ? (
                    <div className="dam-cart-line__qty">
                      <button type="button" onClick={() => onUpdateQty(idx, -1)}>
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-[1.25rem] text-center text-xs font-bold tabular-nums">{line.quantity}</span>
                      <button type="button" onClick={() => onUpdateQty(idx, 1)}>
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-zinc-500">× {line.quantity}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {(freeDeliveryFrom > 0 || minOrder > 0 || nextGift) && (
          <OrderGoalsProgress
            subtotal={subtotal}
            minOrder={minOrder}
            freeDeliveryFrom={freeDeliveryFrom}
            nextGift={nextGift}
            compact
          />
        )}

        <div className="dam-order-totals">
          <div className="dam-order-totals__row">
            <span>Товары</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="dam-order-totals__row">
            <span>{serviceFeeLabel}</span>
            <span>{formatPrice(serviceFeeAmount)}</span>
          </div>
          <div className="dam-order-totals__total">
            <span>Итого</span>
            <span>{formatPrice(totalWithService)}</span>
          </div>
        </div>

        <DamAlemCheckoutButton
          label={checkoutLabel}
          sublabel={
            belowMin
              ? `Минимальная сумма заказа — ${minOrder.toLocaleString('ru-RU')} ₸`
              : formatPrice(totalWithService)
          }
          onClick={onCheckout}
          testId="dam-sidebar-checkout"
        />

        <button
          type="button"
          onClick={onOpenCart}
          className="mt-2 flex w-full items-center justify-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800"
        >
          Подробнее в корзине
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}
