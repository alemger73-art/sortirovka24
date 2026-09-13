import { useStoreTranslations } from '@/i18n/storeTranslations';
import { ArrowLeft, Check, Coins, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import DamAlemImage from '@/components/damalem/DamAlemImage';
import DamAlemShareCard from '@/components/damalem/DamAlemShareCard';
import LoyaltyGiftBanner from '@/components/gastronom/LoyaltyGiftBanner';
import { nextLoyaltyGift, type LoyaltyGift } from '@/lib/gastronomLoyalty';

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
  apartmentFreeFrom?: number;
  gifts?: LoyaltyGift[];
  selectedGiftId?: string | null;
  promoInput: string;
  promoLoading: boolean;
  appliedPromo?: { code: string; label: string; free_delivery?: boolean; pending?: boolean } | null;
  bonusBalance?: number;
  useBonuses?: boolean;
  bonusDiscount?: number;
  maxBonusPoints?: number;
  loggedIn?: boolean;
  whatsappNumber?: string;
  referralEnabled?: boolean;
  referralTitle?: string;
  referralSubtitle?: string;
  referralShareText?: string;
  referralPromoCode?: string;
  formatPrice: (price: number) => string;
  onBrowse: () => void;
  onUpdateQty: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onAddSuggestion: (id: number) => void;
  onPromoInput: (value: string) => void;
  onApplyPromo: () => void;
  onClearPromo: () => void;
  onCheckout: () => void;
  onSelectGift?: (gift: LoyaltyGift) => void;
  onToggleBonuses?: (value: boolean) => void;
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
  apartmentFreeFrom = 0,
  gifts = [],
  selectedGiftId,
  promoInput,
  promoLoading,
  appliedPromo,
  bonusBalance = 0,
  useBonuses = false,
  bonusDiscount = 0,
  maxBonusPoints = 0,
  loggedIn = false,
  whatsappNumber,
  referralEnabled = true,
  referralTitle,
  referralSubtitle,
  referralShareText,
  formatPrice,
  onBrowse,
  onUpdateQty,
  onRemove,
  onAddSuggestion,
  onPromoInput,
  onApplyPromo,
  onClearPromo,
  onCheckout,
  onSelectGift,
  onToggleBonuses,
}: Props) {
  const st = useStoreTranslations();

  if (lines.length === 0) {
    return (
      <div className="dam-cart-empty">
        <span className="dam-cart-empty__icon"><ShoppingBag className="h-8 w-8" /></span>
        <h2>{st("Корзина пуста")}</h2>
        <p>{st("Добавьте блюда из меню — здесь появятся цена, опции и промокод.")}</p>
        <button type="button" onClick={onBrowse} className="dam-btn-primary">
           {st("Перейти в меню")} </button>
      </div>
    );
  }

  const nextGift = nextLoyaltyGift(subtotal, gifts);
  const goals = [
    minOrder > subtotal
      ? { remaining: minOrder - subtotal, label: st("Ещё {0} до минимального заказа", [formatPrice(minOrder - subtotal)]) }
      : null,
    freeDeliveryFrom > subtotal
      ? {
          remaining: freeDeliveryFrom - subtotal,
          label: apartmentFreeFrom === freeDeliveryFrom
            ? st("Ещё {0} — доставка до квартиры бесплатно", [formatPrice(freeDeliveryFrom - subtotal)])
            : st("Ещё {0} до бесплатной доставки", [formatPrice(freeDeliveryFrom - subtotal)]),
        }
      : null,
    nextGift
      ? {
          remaining: nextGift.min_amount - subtotal,
          label: st("Ещё {0} — и подарок на выбор", [formatPrice(nextGift.min_amount - subtotal)]),
        }
      : null,
  ].filter(Boolean).sort((a, b) => a!.remaining - b!.remaining);
  const goal = (minOrder > subtotal ? goals.find(g => g?.remaining === minOrder - subtotal) : goals[0]) ?? null;
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const canCheckout = minOrder <= 0 || subtotal >= minOrder;
  const hasActivePromo = !!appliedPromo && !appliedPromo.pending;
  const showBonusBlock = loggedIn && bonusBalance > 0 && !hasActivePromo;
  const payTotal = Math.max(0, total - (useBonuses ? bonusDiscount : 0));

  return (
    <section className="dam-cart" data-testid="dam-cart-sheet">
      <div className="dam-cart__head">
        <button type="button" onClick={onBrowse} className="dam-cart__back" aria-label={st("Вернуться в меню")}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2>{st("Корзина")}</h2>
          <p>{itemCount} {itemCount % 10 === 1 && itemCount % 100 !== 11 ? st("позиция") : itemCount % 10 >= 2 && itemCount % 10 <= 4 && (itemCount % 100 < 12 || itemCount % 100 > 14) ? st("позиции") : st("позиций")}</p>
        </div>
      </div>

      <div className="dam-cart__grid">
        <div className="dam-cart__main">
          {gifts.length > 0 ? (
            <LoyaltyGiftBanner
              subtotal={subtotal}
              gifts={gifts}
              compact
              selectedGiftId={selectedGiftId}
              onSelectGift={onSelectGift}
            />
          ) : null}

          <div className="dam-cart__lines">
            {lines.map((line, index) => (
              <article key={line.key} className="dam-cart-line">
                <DamAlemImage src={line.image} alt="" className="dam-cart-line__img" />
                <div className="dam-cart-line__body">
                  <div className="dam-cart-line__top">
                    <div className="min-w-0">
                      <h3>{line.name}</h3>
                      {line.modifiers ? <p>{line.modifiers}</p> : null}
                    </div>
                    <button type="button" onClick={() => onRemove(index)} className="dam-cart-line__trash" aria-label={st("Удалить {0}", [line.name])}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="dam-cart-line__bottom">
                    <strong>{formatPrice(line.linePrice)}</strong>
                    <div className="dam-qty">
                      <button type="button" onClick={() => onUpdateQty(index, -1)} data-testid="dam-cart-qty-minus" aria-label={st("Минус")}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <span data-testid="dam-cart-qty-value">{line.quantity}</span>
                      <button type="button" onClick={() => onUpdateQty(index, 1)} data-testid="dam-cart-qty-plus" aria-label={st("Плюс")}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {suggestions.length > 0 ? (
            <div className="dam-cart-upsell">
              <h3>{st("Добавить к заказу")}</h3>
              <div className="dam-cart-upsell__row">
                {suggestions.map(item => (
                  <article key={item.id} className="dam-cart-upsell__card">
                    <DamAlemImage src={item.image} alt="" className="dam-cart-upsell__img" />
                    <div className="min-w-0 flex-1">
                      <h4>{item.name}</h4>
                      <strong>{formatPrice(item.price)}</strong>
                    </div>
                    <button type="button" onClick={() => onAddSuggestion(item.id)} aria-label={st("Добавить {0}", [item.name])}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {referralEnabled ? (
            <DamAlemShareCard
              whatsappNumber={whatsappNumber}
              title={referralTitle}
              subtitle={referralSubtitle}
              shareText={referralShareText}

            />
          ) : null}
        </div>

        <aside className="dam-cart-summary" aria-label={st("Сумма заказа")}>
          <h3>{st("Итого")}</h3>

          {goal ? (
            <div className="dam-cart-goal">
              <p>{goal.label}</p>
              <progress className="dam-cart-progress" value={subtotal} max={subtotal + goal.remaining} aria-label={goal.label} />
            </div>
          ) : (
            <div className="dam-cart-goal dam-cart-goal--ok">
              <p>{st("Всё готово к оформлению")}</p>
            </div>
          )}

          <div className="dam-cart-promo">
            <label htmlFor="dam-cart-promo-input">{st("Промокод")}</label>
            <div className="dam-cart-promo__row">
              <input
                id="dam-cart-promo-input"
                value={promoInput}
                onChange={event => onPromoInput(event.target.value.toUpperCase())}
                placeholder={st("Введите промокод")}
                autoComplete="off"
                spellCheck={false}
                disabled={!!appliedPromo && !appliedPromo.pending}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !appliedPromo && !promoLoading && promoInput.trim()) { event.preventDefault(); onApplyPromo(); }
                }}
              />
              <button
                type="button"
                className={appliedPromo ? 'dam-btn-ghost' : 'dam-btn-dark'}
                onClick={appliedPromo ? onClearPromo : onApplyPromo}
                disabled={!appliedPromo && (promoLoading || !promoInput.trim())}
              >
                {appliedPromo ? st("Сбросить") : promoLoading ? '…' : st("Применить")}
              </button>
            </div>
            {appliedPromo ? (
              <p className={appliedPromo.pending ? 'dam-cart-promo__pending' : 'dam-cart-promo__ok'}>
                {appliedPromo.pending
                  ? st("Код {0} сохранён — скидка включится при нужной сумме", [appliedPromo.code])
                  : (
                    <>
                      <Check className="inline h-3.5 w-3.5 mr-1" />
                      {appliedPromo.code}: {appliedPromo.label}
                    </>
                  )}
              </p>
            ) : null}
          </div>

          {showBonusBlock ? (
            <label className="dam-cart-bonus">
              <input
                type="checkbox"
                checked={useBonuses && maxBonusPoints > 0}
                disabled={maxBonusPoints <= 0}
                onChange={e => onToggleBonuses?.(e.target.checked)}
              />
              <span>
                <strong><Coins className="inline h-4 w-4 mr-1" />{st("Списать бонусы")}</strong>
                <small>
                   {st("Баланс")} {bonusBalance.toLocaleString('ru-RU')}  {st("бонусов")} {useBonuses && bonusDiscount > 0 ? ` · −${formatPrice(bonusDiscount)}` : ''}
                </small>
              </span>
            </label>
          ) : null}

          {loggedIn && bonusBalance > 0 && hasActivePromo ? (
            <p className="dam-cart-hint">{st("Бонусы и промокод вместе не суммируются — выберите одно.")}</p>
          ) : null}

          <div className="dam-cart-totals">
            <div><span>{st("Блюда")}</span><span>{formatPrice(subtotal)}</span></div>
            {serviceFee > 0 ? <div><span>{serviceFeeLabel}</span><span>{formatPrice(serviceFee)}</span></div> : null}
            {discount > 0 ? (
              <div className="dam-cart-totals__discount"><span>{st("Скидка")}</span><span>−{formatPrice(discount)}</span></div>
            ) : null}
            {discount <= 0 && hasActivePromo && appliedPromo?.free_delivery ? (
              <div className="dam-cart-totals__discount"><span>{st("Промокод")}</span><span>{st("доставка 0 ₸")}</span></div>
            ) : null}
            {useBonuses && bonusDiscount > 0 ? (
              <div className="dam-cart-totals__discount"><span>{st("Бонусы")}</span><span>−{formatPrice(bonusDiscount)}</span></div>
            ) : null}
            <div className="dam-cart-totals__pay">
              <span>{st("Без доставки")}</span>
              <strong>{formatPrice(payTotal)}</strong>
            </div>
          </div>

          <button
            type="button"
            className="dam-btn-primary dam-btn-primary--xl"
            data-testid="dam-cart-checkout"
            disabled={!canCheckout}
            onClick={onCheckout}
          >
            {canCheckout ? st("Оформить · {0}", [formatPrice(payTotal)]) : st("Мин. заказ {0}", [formatPrice(minOrder)])}
          </button>
          <p className="dam-cart-footnote">{st("Стоимость доставки и окончательную сумму покажем до подтверждения заказа.")}</p>
        </aside>
      </div>
    </section>
  );
}
