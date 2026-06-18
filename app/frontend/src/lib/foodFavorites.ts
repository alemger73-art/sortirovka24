const KEY = 'damalem_favorites_v1';

export function loadFavoriteIds(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

export function saveFavoriteIds(ids: number[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function toggleFavoriteId(id: number): number[] {
  const set = new Set(loadFavoriteIds());
  if (set.has(id)) set.delete(id);
  else set.add(id);
  const next = [...set];
  saveFavoriteIds(next);
  return next;
}

export function isFavoriteId(id: number): boolean {
  return loadFavoriteIds().includes(id);
}
