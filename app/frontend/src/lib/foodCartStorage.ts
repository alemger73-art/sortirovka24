const CART_KEY = 'damalem_cart_v1';

export type CartItemSelection = Record<number, number[]>;

export interface StoredCartLine {
  itemId: number;
  quantity: number;
  selections: CartItemSelection;
}

interface MinimalFoodItem {
  id: number;
  name: string;
  price: number;
  category_id: number;
  description?: string;
  image_url?: string;
  is_active?: boolean;
  is_recommended?: boolean;
  weight?: string;
  sort_order?: number;
  is_popular?: boolean;
  is_combo?: boolean;
  category_slug?: string;
  available?: boolean;
}

export function saveFoodCart(cart: { item: { id: number }; quantity: number; selections: CartItemSelection }[]): void {
  try {
    const lines: StoredCartLine[] = cart.map(ci => ({
      itemId: ci.item.id,
      quantity: ci.quantity,
      selections: ci.selections || {},
    }));
    localStorage.setItem(CART_KEY, JSON.stringify(lines));
  } catch {
    /* ignore */
  }
}

export function loadFoodCart<T extends MinimalFoodItem>(items: T[]): { item: T; quantity: number; selections: CartItemSelection }[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const lines = JSON.parse(raw) as StoredCartLine[];
    if (!Array.isArray(lines)) return [];
    const byId = new Map(items.map(i => [i.id, i]));
    return lines
      .map(line => {
        const item = byId.get(line.itemId);
        if (!item || item.is_active === false || item.available === false) return null;
        return {
          item,
          quantity: Math.max(1, line.quantity || 1),
          selections: line.selections || {},
        };
      })
      .filter(Boolean) as { item: T; quantity: number; selections: CartItemSelection }[];
  } catch {
    return [];
  }
}

export function clearFoodCartStorage(): void {
  try {
    localStorage.removeItem(CART_KEY);
  } catch {
    /* ignore */
  }
}

/** Bump version so open /food tabs reload menu after admin edits. */
export function bumpFoodMenuVersion(): void {
  try {
    localStorage.setItem('food_menu_version', String(Date.now()));
  } catch {
    /* ignore */
  }
}

export const FOOD_MENU_VERSION_KEY = 'food_menu_version';
