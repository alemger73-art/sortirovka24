const KEY = 'dam-checkout-auth-return-v1';
const MAX_AGE = 30 * 60 * 1000;

export interface FoodCheckoutReturn {
  step: 1 | 2 | 3;
  deliveryMethod: 'delivery' | 'pickup' | 'dine_in';
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  apartment: string;
  deliverToApartment: boolean;
  comment: string;
  preorder: boolean;
  schedule: string;
  cashGiven: string;
  payment: 'cash' | 'kaspi_qr' | 'halyk_qr';
  selectedGiftId: string | null;
}

/** Short-lived, tab-local form state. Prices and delivery quotes are recalculated. */
export function saveFoodCheckoutReturn(form: FoodCheckoutReturn): void {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...form, savedAt: Date.now() })); }
  catch { /* Checkout remains usable when storage is unavailable. */ }
}

export function takeFoodCheckoutReturn(): FoodCheckoutReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || typeof value.savedAt !== 'number'
      || Date.now() - value.savedAt > MAX_AGE || value.savedAt > Date.now()) return null;
    if (![1, 2, 3].includes(value.step) || !['delivery', 'pickup', 'dine_in'].includes(value.deliveryMethod)
      || !['cash', 'kaspi_qr', 'halyk_qr'].includes(value.payment)) return null;
    for (const field of ['customerName', 'customerPhone', 'deliveryAddress', 'apartment', 'comment', 'schedule', 'cashGiven']) {
      if (typeof value[field] !== 'string' || value[field].length > 2000) return null;
    }
    if (typeof value.deliverToApartment !== 'boolean' || typeof value.preorder !== 'boolean'
      || (value.selectedGiftId !== null && typeof value.selectedGiftId !== 'string')) return null;
    return value as FoodCheckoutReturn;
  } catch { return null; }
}
