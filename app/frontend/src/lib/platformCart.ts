export interface PlatformCartSegment {
  id: string;
  label: string;
  path: string;
  count: number;
  accent: string;
}

function readQtyMap(key: string, legacyKey?: string): Record<number, number> {
  try {
    const raw = localStorage.getItem(key) ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<number, number>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function countQtyMap(map: Record<number, number>): number {
  return Object.values(map).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

function readFoodCartCount(): number {
  try {
    const raw = localStorage.getItem('damalem_cart_v1');
    if (!raw) return 0;
    const lines = JSON.parse(raw);
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((sum: number, line: { quantity?: number }) => sum + Math.max(0, Number(line?.quantity) || 0), 0);
  } catch {
    return 0;
  }
}

export function getPlatformCartSegments(): PlatformCartSegment[] {
  const segments: PlatformCartSegment[] = [
    {
      id: 'food',
      label: 'DAM ALEM',
      path: '/food',
      count: readFoodCartCount(),
      accent: 'bg-orange-500',
    },
    {
      id: 'volna',
      label: 'VOLNA',
      path: '/volna?tab=cart',
      count: countQtyMap(readQtyMap('volna_cart_qty', 'volna_cart')),
      accent: 'bg-violet-700',
    },
    {
      id: 'gastronom',
      label: 'Гастроном',
      path: '/gastronom?tab=cart',
      count: countQtyMap(readQtyMap('gastronom_cart_qty', 'gastronom_cart')),
      accent: 'bg-emerald-600',
    },
    {
      id: 'pharmacy',
      label: 'Аптека',
      path: '/apteka?tab=cart',
      count: countQtyMap(readQtyMap('pharmacy_cart_qty')),
      accent: 'bg-teal-600',
    },
    {
      id: 'prorab',
      label: 'Прораб',
      path: '/prorab?tab=cart',
      count: countQtyMap(readQtyMap('prorab_cart_qty')),
      accent: 'bg-amber-600',
    },
  ];
  return segments.filter((s) => s.count > 0);
}

export function platformCartTotalCount(segments = getPlatformCartSegments()): number {
  return segments.reduce((sum, s) => sum + s.count, 0);
}

export const PLATFORM_CART_CHANGED_EVENT = 'platform-cart-changed';

export function notifyPlatformCartChanged(): void {
  window.dispatchEvent(new Event(PLATFORM_CART_CHANGED_EVENT));
}

export function clearPlatformCartSegment(id: string): void {
  switch (id) {
    case 'food':
      localStorage.removeItem('damalem_cart_v1');
      break;
    case 'volna':
      localStorage.removeItem('volna_cart_qty');
      localStorage.removeItem('volna_cart');
      break;
    case 'gastronom':
      localStorage.removeItem('gastronom_cart_qty');
      localStorage.removeItem('gastronom_cart');
      break;
    case 'pharmacy':
      localStorage.removeItem('pharmacy_cart_qty');
      break;
    case 'prorab':
      localStorage.removeItem('prorab_cart_qty');
      break;
    default:
      return;
  }
  notifyPlatformCartChanged();
}
