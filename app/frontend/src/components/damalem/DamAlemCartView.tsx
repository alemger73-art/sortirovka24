import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import DamAlemImage from '@/components/damalem/DamAlemImage';
import DamAlemCheckoutButton from '@/components/damalem/DamAlemCheckoutButton';

export interface DamAlemCartLineView {
  key: string;
  name: string;
  image: string;
  modifiers?: string;
  quantity: number;
  linePrice: number;
}

export interface DamAlemCartSuggestionView {
  id: number;
  name: string;
  image: string;
  price: number;
}

interface Props {
  lines: DamAlemCartLineView[];
  suggestions: DamAlemCartSuggestionView[];
  subtotal: number;
  serviceFeeLabel: string;
  serviceFee: number;
  discount: number;
  total: number;
  minOrder: number;
  freeDeliveryFrom: number;
  promoInput: string;
  promoLoading: boolean;
  appliedPromo?: { code: string; label: string } | null;
  formatPrice: (price: number) => string;
  onBrowse: () => void;
  onUpdateQty: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onAddSuggestion: (id: number) => void;
  onPromoInput: (value: string) => void;
  onApplyPromo: () => void;
  onClearPromo: () => void;
  onCheckout: () => void;
}

export default function DamAlemCartView({
  lines,
  suggestions,
  subtotal,
  serviceFeeLabel,
  serviceFee,
  discount,
  total,
  minOrder,
  freeDeliveryFrom,
  promoInput,
  promoLoading,
  appliedPromo,
  formatPrice,
  onBrowse,
  onUpdateQty,
  onRemove,
  onAddSuggestion,
  onPromoInput,
  onApplyPromo,
  onClearPromo,
  onCheckout,
}: Props) {
  if (lines.length === 0) {
    return (
      <div className="dam-market-empty">
        <span className="dam-market-empty__icon"><ShoppingBag className="h-8 w-8" /></span>
        <h2>Корзина пока пустая</h2>
        <p>Выберите блюда — они появятся здесь.</p>
        <button type="button" onClick={onBrowse} className="dam-market-primary">
          Перейти в меню
        </button>
      </div>
    );
  }

  const goal = minOrder > subtotal
    ? { target: minOrder, label: `До минимального заказа ${formatPrice(minOrder - subtotal)}` }
    : freeDeliveryFrom > subtotal
      ? { target: freeDeliveryFrom, label: `До бесплатной доставки ${formatPrice(freeDeliveryFrom - subtotal)}` }
      : null;
  const progress = goal ? Math.min(100, Math.round((subtotal / goal.target) * 100)) : 100;
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const itemCountLabel = itemCount % 10 === 1 && itemCount % 100 !== 11
    ? 'позиция'
    : [2, 3, 4].includes(itemCount % 10) && ![12, 13, 14].includes(itemCount % 100)
      ? 'позиции'
      : 'позиций';

  return (
    <section className="dam-market-cart" data-testid="dam-cart-sheet">
      <div className="dam-market-cart__head">
        <button type="button" onClick={onBrowse} className="dam-market-icon-btn" aria-label="Вернуться в меню">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2>Ваш заказ</h2>
          <p>{itemCount} {itemCountLabel}</p>
        </div>
      </div>

      <div className="dam-market-cart__layout">
        <div className="min-w-0 space-y-5">
          <div className="dam-market-cart__lines">
            {lines.map((line, index) => (
              <article key={line.key} className="dam-market-cart-line">
                <DamAlemImage src={line.image} alt="" className="dam-market-cart-line__image" />
                <div className="dam-market-cart-line__content">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3>{line.name}</h3>
                      {line.modifiers ? <p>{line.modifiers}</p> : null}
                    </div>
                    <button type="button" onClick={() => onRemove(index)} className="dam-market-cart-line__remove" aria-label="Удалить">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="dam-market-cart-line__bottom">
                    <strong>{formatPrice(line.linePrice)}</strong>
                    <div className="dam-market-qty">
                      <button type="button" onClick={() => onUpdateQty(index, -1)} data-testid="dam-cart-qty-minus" aria-label="Уменьшить">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span data-testid="dam-cart-qty-value">{line.quantity}</span>
                      <button type="button" onClick={() => onUpdateQty(index, 1)} data-testid="dam-cart-qty-plus" aria-label="Увеличить">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="dam-market-cart-mobile-promo">
            <div>
              <strong>{goal?.label || 'Доступна бесплатная доставка'}</strong>
              <div className="dam-market-goal__track"><span style={{ width: `${progress}%` }} /></div>
            </div>
            <div className="dam-market-promo">
              <input
                value={promoInput}
                onChange={event => onPromoInput(event.target.value.toUpperCase())}
                placeholder="Промокод"
                disabled={!!appliedPromo}
              />
              <button type="button" onClick={appliedPromo ? onClearPromo : onApplyPromo} disabled={!appliedPromo && (promoLoading || !promoInput.trim())}>
                {appliedPromo ? 'Сбросить' : promoLoading ? '…' : 'Применить'}
              </button>
              {appliedPromo ? <p>Промокод {appliedPromo.code} применён</p> : null}
            </div>
          </div>

          <div className="dam-market-cart-mobile-totals">
            <div><span>Блюда</span><span>{formatPrice(subtotal)}</span></div>
            <div><span>{serviceFeeLabel}</span><span>{formatPrice(serviceFee)}</span></div>
            {discount > 0 ? <div className="text-emerald-700"><span>Скидка</span><span>−{formatPrice(discount)}</span></div> : null}
            <div><strong>К оплате</strong><strong>{formatPrice(total)}</strong></div>
          </div>

          {suggestions.length > 0 ? (
            <div>
              <div className="dam-market-section-head">
                <div>
                  <span>Можно добавить</span>
                  <h3>Дополните заказ</h3>
                </div>
              </div>
              <div className="dam-market-upsell">
                {suggestions.map(item => (
                  <article key={item.id} className="dam-market-upsell-card">
                    <DamAlemImage src={item.image} alt="" className="dam-market-upsell-card__image" />
                    <div className="min-w-0 flex-1">
                      <h4>{item.name}</h4>
                      <strong>{formatPrice(item.price)}</strong>
                    </div>
                    <button type="button" onClick={() => onAddSuggestion(item.id)} aria-label={`Добавить ${item.name}`}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="dam-market-cart-summary">
          <h3>Итого</h3>
          <div className="dam-market-goal">
            <div className="dam-market-goal__track"><span style={{ width: `${progress}%` }} /></div>
            <p>{goal?.label || 'Доступна бесплатная доставка'}</p>
          </div>

          <div className="dam-market-promo">
            <input
              value={promoInput}
              onChange={event => onPromoInput(event.target.value.toUpperCase())}
              placeholder="Промокод"
              disabled={!!appliedPromo}
            />
            <button type="button" onClick={appliedPromo ? onClearPromo : onApplyPromo} disabled={!appliedPromo && (promoLoading || !promoInput.trim())}>
              {appliedPromo ? 'Сбросить' : promoLoading ? '…' : 'Применить'}
            </button>
            {appliedPromo ? <p>Промокод {appliedPromo.code} применён</p> : null}
          </div>

          <div className="dam-market-totals">
            <div><span>Блюда</span><span>{formatPrice(subtotal)}</span></div>
            <div><span>{serviceFeeLabel}</span><span>{formatPrice(serviceFee)}</span></div>
            {discount > 0 ? <div className="text-emerald-700"><span>Скидка</span><span>−{formatPrice(discount)}</span></div> : null}
            <div className="dam-market-totals__total"><span>К оплате</span><span>{formatPrice(total)}</span></div>
          </div>

          <DamAlemCheckoutButton
            label="Перейти к оформлению"
            sublabel={minOrder > subtotal ? `Минимальный заказ ${formatPrice(minOrder)}` : formatPrice(total)}
            onClick={onCheckout}
            testId="dam-cart-checkout"
          />
        </aside>
      </div>
    </section>
  );
}
