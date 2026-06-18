export type PromoType = 'percent' | 'fixed' | 'free_delivery';

export interface FoodPromoCode {
  code: string;
  type: PromoType;
  value: number;
  min_order?: number;
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
        active: p.active !== false && p.active !== '0',
        label: p.label ? String(p.label) : undefined,
      }))
      .filter((p) => p.code.length > 0 && p.active);
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
  return {
    discount: Math.round(subtotal * (pct / 100)),
    freeDelivery: false,
    label: promo.label || `−${pct}%`,
  };
}
