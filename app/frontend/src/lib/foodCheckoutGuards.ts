/** Checkout blocking reasons shown to the customer. No design system changes. */

export type FoodCheckoutContext = {
  kitchenOpen: boolean;
  kitchenMessage?: string;
  cartTotal: number;
  minOrder: number;
  deliveryMethod: 'delivery' | 'pickup';
  deliveryReady: boolean;
  deliveryQuoteLoading: boolean;
  /** Trimmed address the customer entered / selected */
  deliveryAddress?: string;
  /** API / network error while resolving a quote */
  deliveryQuoteError?: string | null;
  /** Quote said unavailable (outside polygon) or location warning */
  deliveryUnavailableMessage?: string | null;
  deliverToApartment: boolean;
  apartment: string;
  customerName: string;
  customerPhone: string;
  loggedIn: boolean;
};

export function foodCheckoutBlockReason(ctx: FoodCheckoutContext): string | null {
  if (!ctx.kitchenOpen) return ctx.kitchenMessage || 'Сейчас кухня закрыта';
  if (ctx.minOrder > 0 && ctx.cartTotal < ctx.minOrder) {
    return `Минимальная сумма заказа — ${ctx.minOrder.toLocaleString('ru-RU')} ₸`;
  }
  if (ctx.deliveryMethod === 'delivery') {
    if (ctx.deliveryQuoteLoading) {
      return 'Определяем зону доставки…';
    }
    const addr = (ctx.deliveryAddress || '').trim();
    if (addr.length < 5) {
      return 'Укажите адрес доставки';
    }
    if (ctx.deliveryQuoteError) {
      return ctx.deliveryQuoteError.length < 180
        ? ctx.deliveryQuoteError
        : 'Не удалось определить зону доставки. Попробуйте ещё раз или «Я здесь сейчас».';
    }
    if (ctx.deliveryUnavailableMessage) {
      return ctx.deliveryUnavailableMessage.length < 180
        ? ctx.deliveryUnavailableMessage
        : 'Адрес вне зоны доставки';
    }
    if (!ctx.deliveryReady) {
      return 'Укажите адрес доставки: «Я здесь сейчас» или «Найти на карте»';
    }
  }
  if (ctx.deliveryMethod === 'delivery' && ctx.deliverToApartment && !ctx.apartment.trim()) {
    return 'Укажите номер квартиры для доставки до двери';
  }
  if (!ctx.customerName.trim()) return 'Укажите имя';
  if (!ctx.customerPhone.trim()) return 'Укажите номер телефона';
  if (!ctx.loggedIn) return 'Войдите, чтобы оформить заказ';
  return null;
}

export function publicOrderErrorMessage(error: unknown): string {
  const err = error as {
    message?: string;
    response?: { data?: { detail?: unknown }; status?: number };
  };
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim() && detail.length < 280) {
    if (/internal server error|traceback|sqlalchemy|exception/i.test(detail)) {
      return 'Не удалось оформить заказ. Попробуйте ещё раз.';
    }
    return detail;
  }
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object' && 'msg' in detail[0]) {
    return String((detail[0] as { msg: string }).msg);
  }
  const msg = err.message || '';
  if (msg && !/internal server error|network error|failed to fetch/i.test(msg)) {
    return msg.length < 280 ? msg : 'Не удалось оформить заказ. Попробуйте ещё раз.';
  }
  return 'Не удалось оформить заказ. Проверьте данные и попробуйте ещё раз.';
}
