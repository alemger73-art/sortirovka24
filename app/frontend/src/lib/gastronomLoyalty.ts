export interface LoyaltyGift {
  id: string;
  min_amount: number;
  title: string;
  description?: string;
  image_url?: string;
  is_active: boolean;
  sort_order: number;
}

export function isLoyaltyEnabled(settings: Record<string, string | undefined>): boolean {
  const raw = (settings.loyalty_enabled ?? '1').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

export function parseLoyaltyGifts(raw: string | undefined): LoyaltyGift[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map((item, idx) => {
        if (!item || typeof item !== 'object') return null;
        const title = String(item.title || '').trim();
        const minAmount = Number(item.min_amount) || 0;
        if (!title || minAmount <= 0) return null;
        return {
          id: String(item.id || `gift-${idx + 1}`),
          min_amount: minAmount,
          title,
          description: String(item.description || '').trim(),
          image_url: String(item.image_url || '').trim(),
          is_active: item.is_active !== false,
          sort_order: Number(item.sort_order) || idx + 1,
        } satisfies LoyaltyGift;
      })
      .filter(Boolean)
      .sort((a, b) => a!.min_amount - b!.min_amount || a!.sort_order - b!.sort_order) as LoyaltyGift[];
  } catch {
    return [];
  }
}

export function serializeLoyaltyGifts(gifts: LoyaltyGift[]): string {
  return JSON.stringify(
    gifts.map((g, idx) => ({
      ...g,
      sort_order: g.sort_order || idx + 1,
    }))
  );
}

export function resolveLoyaltyGift(subtotal: number, gifts: LoyaltyGift[]): LoyaltyGift | null {
  const active = gifts.filter((g) => g.is_active);
  let matched: LoyaltyGift | null = null;
  for (const gift of active) {
    if (subtotal >= gift.min_amount) matched = gift;
  }
  return matched;
}

export function nextLoyaltyGift(subtotal: number, gifts: LoyaltyGift[]): LoyaltyGift | null {
  const active = gifts.filter((g) => g.is_active);
  return active.find((g) => subtotal < g.min_amount) ?? null;
}

export function newLoyaltyGift(index: number): LoyaltyGift {
  return {
    id: crypto.randomUUID?.() || `gift-${Date.now()}`,
    min_amount: (index + 1) * 5000,
    title: '',
    description: '',
    image_url: '',
    is_active: true,
    sort_order: index + 1,
  };
}

export function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}
