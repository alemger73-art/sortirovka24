import { CATEGORY_ICONS } from '@/lib/api';

export const CATEGORY_GRADIENTS: Record<string, string> = {
  'Сантехник': 'from-sky-400 to-blue-600',
  'Электрик': 'from-amber-400 to-orange-600',
  'Сварщик': 'from-orange-400 to-red-600',
  'Мебельщик': 'from-emerald-400 to-green-600',
  'Ремонт техники': 'from-violet-400 to-purple-600',
  'Грузчики': 'from-cyan-400 to-sky-600',
  'Ремонт квартир': 'from-rose-400 to-pink-600',
  'Окна и двери': 'from-teal-400 to-emerald-600',
  'Натяжные потолки': 'from-indigo-400 to-blue-600',
  'Разнорабочие': 'from-slate-400 to-gray-600',
};

export const CATEGORY_BG: Record<string, string> = {
  'Сантехник': 'bg-sky-50 dark:bg-sky-950/40',
  'Электрик': 'bg-amber-50 dark:bg-amber-950/40',
  'Сварщик': 'bg-orange-50 dark:bg-orange-950/40',
  'Мебельщик': 'bg-emerald-50 dark:bg-emerald-950/40',
  'Ремонт техники': 'bg-violet-50 dark:bg-violet-950/40',
  'Грузчики': 'bg-cyan-50 dark:bg-cyan-950/40',
  'Ремонт квартир': 'bg-rose-50 dark:bg-rose-950/40',
  'Окна и двери': 'bg-teal-50 dark:bg-teal-950/40',
  'Натяжные потолки': 'bg-indigo-50 dark:bg-indigo-950/40',
  'Разнорабочие': 'bg-slate-50 dark:bg-slate-950/40',
};

export function categoryGradient(category: string) {
  return CATEGORY_GRADIENTS[category] || 'from-blue-500 to-indigo-600';
}

export function categoryIcon(category: string) {
  return CATEGORY_ICONS[category] || '🔧';
}

export function parseServices(services?: string | null, limit = 3): string[] {
  if (!services) return [];
  return services.split(',').map(s => s.trim()).filter(Boolean).slice(0, limit);
}

export function galleryCount(gallery?: string | null): number {
  if (!gallery) return 0;
  return gallery.split(',').map(k => k.trim()).filter(Boolean).length;
}

export function sortMasters<T extends { verified?: boolean; available_today?: boolean; rating?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const verifiedDiff = Number(Boolean(b.verified)) - Number(Boolean(a.verified));
    if (verifiedDiff !== 0) return verifiedDiff;
    const availDiff = Number(Boolean(b.available_today)) - Number(Boolean(a.available_today));
    if (availDiff !== 0) return availDiff;
    return (Number(b.rating) || 0) - (Number(a.rating) || 0);
  });
}

export function matchesMasterSearch(master: Record<string, unknown>, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const haystack = [
    master.name,
    master.category,
    master.description,
    master.services,
    master.district,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}
