import { Link } from 'react-router-dom';
import { Check, MessageSquare, Phone } from 'lucide-react';
import { useStoreTranslations } from '@/i18n/storeTranslations';
import FoodOrderStatusBar from '@/components/damalem/FoodOrderStatusBar';
import { ruBonusNoun } from '@/components/damalem/DamOrderParts';

export interface OrderDoneInfo {
  id: number;
  total: number;
  paymentLabel: string;
  paymentMethod: 'cash' | 'kaspi_qr' | 'halyk_qr';
  name: string;
  phone: string;
  address: string;
  deliveryMethod: 'delivery' | 'pickup' | 'dine_in';
  invoicePhone?: string;
  itemsText: string;
  giftTitle?: string;
  /** Bonuses the order earns after delivery (cashback rate × food after discounts). */
  cashback: number;
  guest: boolean;
}

/** «Заказ принят»: what happens next, the live status and the bonuses to come. */
export default function DamOrderDone({ info, status, live, deliveryTime, maxBonusPercent, restaurantPhone, formatPrice, onMenu, onLogin, onWhatsApp }: {
  info: OrderDoneInfo;
  status: string;
  /** The status refreshes by itself (signed-in customer). */
  live: boolean;
  deliveryTime: string;
  maxBonusPercent: number;
  restaurantPhone: string;
  formatPrice: (n: number) => string;
  onMenu: () => void;
  onLogin: () => void;
  onWhatsApp: () => void;
}) {
  const st = useStoreTranslations();
  const tel = restaurantPhone.replace(/[^+\d]/g, '');
  return <main className="dam-done" aria-labelledby="dam-done-title" data-testid="dam-order-done">
    <section className="dam-done__head">
      <span className="dam-done__check" aria-hidden="true"><Check className="h-7 w-7" strokeWidth={3} /></span>
      <h1 id="dam-done-title">{st('Заказ принят')}{info.id > 0 ? <small> № {info.id}</small> : null}</h1>
      <p>{st('Перезвоним за 2 минуты, чтобы подтвердить.')} <span>{info.phone}</span></p>
    </section>

    <section className="dam-os-card" aria-label={st('Статус заказа')}>
      <p className="dam-done__eta"><strong>{st('Ориентир: {0}', [deliveryTime])}</strong>{live ? <small>{st('обновляется само')}</small> : null}</p>
      <FoodOrderStatusBar status={status} deliveryMethod={info.deliveryMethod} />
    </section>

    {info.paymentMethod !== 'cash' ? <section className="dam-os-card dam-done__invoice">
      <strong>{st('Ожидайте счёт в')} {info.paymentLabel}</strong>
      <p>{st('Оператор выставит счёт на')} {info.invoicePhone || info.phone} {st('— обычно за 1–3 минуты. Откройте приложение и оплатите. Статус оплаты — в «Мои заказы».')}</p>
    </section> : null}

    {info.cashback > 0 && !info.guest ? <section className="dam-done__bonus">
      <span className="dam-os-coin" aria-hidden="true">+</span>
      <span><strong>{st('После доставки начислим {0} {1}', [info.cashback, ruBonusNoun(info.cashback)])}</strong>
        <small>{st('1 бонус = 1 ₸, списываются до {0}% заказа', [maxBonusPercent])}</small></span>
    </section> : null}

    {info.guest ? <section className="dam-done__claim">
      <strong>{info.cashback > 0 ? st('Заберите {0} {1} за этот заказ — войдите', [info.cashback, ruBonusNoun(info.cashback)]) : st('Войдите, чтобы копить бонусы за заказы')}</strong>
      <small>{st('Войдите с номером {0} — бонусы за заказ придут в кабинет.', [info.phone])}</small>
      <button type="button" onClick={onLogin} data-testid="dam-done-login">{st('Войти через Telegram или WhatsApp')}</button>
    </section> : null}

    <section className="dam-os-card dam-done__order">
      <strong>{info.itemsText}</strong>
      {info.giftTitle ? <span>{st('Подарок: {0}', [info.giftTitle])}</span> : null}
      <span>{info.deliveryMethod === 'delivery' ? info.address : info.deliveryMethod === 'dine_in' ? st('В заведении') : st('Самовывоз')}</span>
      <span>{st(info.paymentLabel)} · {formatPrice(info.total)}</span>
    </section>

    <div className="dam-done__actions">
      {tel ? <a href={`tel:${tel}`} className="dam-done__call"><Phone className="h-4 w-4" aria-hidden="true" />{st('Позвонить нам')}</a> : null}
      <button type="button" className="dam-done__menu" onClick={onMenu}>{st('В меню')}</button>
    </div>
    {!info.guest && info.id > 0 ? <Link to={`/cabinet/orders/food/${info.id}`} className="dam-os-link dam-done__more">{st('Отследить заказ')}</Link> : null}
    <button type="button" className="dam-os-link dam-done__more" onClick={onWhatsApp}><MessageSquare className="h-4 w-4" aria-hidden="true" />{st('Написать в WhatsApp')}</button>
  </main>;
}
