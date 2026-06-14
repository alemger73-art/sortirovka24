export const DAM_ALEM_BRAND = 'DAM ALEM';

export const DAM_ALEM_HERO_FALLBACK =
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-15/fe194ca1-0095-44bf-a906-e50cb844ad56.png';

export const DAM_ALEM_COLORS = {
  primary: '#FF3B30',
  primaryHover: '#E6352B',
  dark: '#111111',
  muted: '#777777',
  surface: '#F5F5F5',
} as const;

export function isDamAlemName(name: string | null | undefined): boolean {
  const n = (name || '').toLowerCase().replace(/\s+/g, '');
  return n.includes('damalem') || n.includes('дамалем');
}

export function findDamAlemRestaurantId(restaurants: { id: number; name: string }[]): number | null {
  const hit = restaurants.find(r => isDamAlemName(r.name));
  return hit?.id ?? restaurants[0]?.id ?? null;
}
