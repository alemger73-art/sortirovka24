export type PromoType = 'percent' | 'fixed' | 'free_delivery';

export interface FoodPromoCode {
  code: string;
  type: PromoType;
  value: number;
  min_order?: number;
  max_discount?: number;
  valid_from?: string;
  valid_until?: string;
  active?: boolean;
  label?: string;
}

export function parsePromoCodes(raw?: string): FoodPromoCode[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.code === 'string')
      .map((p) => ({
        code: String(p.code).trim().toUpperCase(),
        type: (['percent', 'fixed', 'free_delivery'].includes(p.type) ? p.type : 'percent') as PromoType,
        value: Number(p.value) || 0,
        min_order: p.min_order != null ? Number(p.min_order) : undefined,
        max_discount: p.max_discount != null ? Number(p.max_discount) : undefined,
        valid_from: p.valid_from ? String(p.valid_from) : undefined,
        valid_until: p.valid_until ? String(p.valid_until) : undefined,
        active: ![false, '0', 'false', 'no', 'off'].includes(
          typeof p.active === 'string' ? p.active.toLowerCase() : p.active,
        ),
        label: p.label ? String(p.label) : undefined,
      }))
      .filter((p) => p.code.length > 0);
  } catch {
    return [];
  }
}

export function serializePromoCodes(codes: FoodPromoCode[]): string {
  return JSON.stringify(codes);
}

export function newPromoCode(): FoodPromoCode {
  return { code: '', type: 'percent', value: 10, min_order: 0, active: true, label: '' };
}

export function isPromoCurrent(promo: FoodPromoCode, today = new Date()): boolean {
  if (promo.active === false) return false;
  const date = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  if (promo.valid_from && date < promo.valid_from) return false;
  if (promo.valid_until && date > promo.valid_until) return false;
  return true;
}

export function calcPromoDiscount(
  subtotal: number,
  promo: FoodPromoCode | null,
): { discount: number; freeDelivery: boolean; label: string } {
  if (!promo) return { discount: 0, freeDelivery: false, label: '' };
  if (promo.min_order && subtotal < promo.min_order) {
    return { discount: 0, freeDelivery: false, label: '' };
  }
  if (promo.type === 'free_delivery') {
    return { discount: 0, freeDelivery: true, label: promo.label || 'Бесплатная доставка' };
  }
  if (promo.type === 'fixed') {
    return { discount: Math.min(subtotal, promo.value), freeDelivery: false, label: promo.label || `−${promo.value} ₸` };
  }
  const pct = Math.max(0, Math.min(100, promo.value));
  const rawDiscount = Math.round(subtotal * (pct / 100));
  return {
    discount: promo.max_discount && promo.max_discount > 0
      ? Math.min(rawDiscount, promo.max_discount)
      : rawDiscount,
    freeDelivery: false,
    label: promo.label || `−${pct}%`,
  };
}
