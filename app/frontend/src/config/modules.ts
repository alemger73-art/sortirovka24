/**
 * Single source of truth for toggleable app modules.
 *
 * Admin can switch a module off and it disappears everywhere: home tiles,
 * quick actions, banners, hero buttons, footer nav, bottom nav, the "More"
 * page, and its routes (which redirect home). Keep this list in sync with the
 * backend services/module_settings.py MODULE_KEYS.
 *
 * Taxi and "Support project" keep their own dedicated toggles and are NOT
 * managed here.
 */

export type ModuleKey =
  | 'food'
  | 'gastronom'
  | 'prorab'
  | 'pharmacy'
  | 'masters'
  | 'salons'
  | 'inspectors'
  | 'real_estate'
  | 'announcements'
  | 'jobs'
  | 'directory'
  | 'transport'
  | 'questions'
  | 'complaints'
  | 'news'
  | 'business'
  | 'history';

export interface ModuleDef {
  key: ModuleKey;
  /** Russian label shown in the admin panel. */
  label: string;
  /** Route path prefixes owned by this module (used for route guarding). */
  paths: string[];
}

export const MODULE_DEFS: ModuleDef[] = [
  { key: 'food', label: 'Еда / доставка', paths: ['/food'] },
  { key: 'gastronom', label: 'Гастроном', paths: ['/gastronom'] },
  { key: 'prorab', label: 'Прораб (стройка)', paths: ['/prorab'] },
  { key: 'pharmacy', label: 'Аптека', paths: ['/apteka', '/pharmacy'] },
  { key: 'masters', label: 'Мастера', paths: ['/masters'] },
  { key: 'salons', label: 'Салоны красоты', paths: ['/salons'] },
  { key: 'inspectors', label: 'Участковые', paths: ['/inspectors'] },
  { key: 'real_estate', label: 'Недвижимость', paths: ['/real-estate'] },
  { key: 'announcements', label: 'Объявления', paths: ['/announcements', '/ads'] },
  { key: 'jobs', label: 'Вакансии / работа', paths: ['/jobs'] },
  { key: 'directory', label: 'Справочник', paths: ['/directory'] },
  { key: 'transport', label: 'Транспорт / автобусы', paths: ['/transport'] },
  { key: 'questions', label: 'Вопросы и ответы', paths: ['/questions'] },
  { key: 'complaints', label: 'Жалобы', paths: ['/complaints'] },
  { key: 'news', label: 'Новости', paths: ['/news'] },
  { key: 'business', label: 'Для бизнеса', paths: ['/business'] },
  { key: 'history', label: 'История района', paths: ['/history'] },
];

export const MODULE_KEYS: ModuleKey[] = MODULE_DEFS.map((m) => m.key);

/** All modules enabled — used as a safe fallback before settings load. */
export const DEFAULT_MODULES: Record<ModuleKey, boolean> = MODULE_KEYS.reduce(
  (acc, key) => {
    acc[key] = true;
    return acc;
  },
  {} as Record<ModuleKey, boolean>,
);

/**
 * Resolve which module owns a given route path (longest prefix wins).
 * Returns null for routes not tied to a toggleable module.
 */
export function moduleForPath(pathname: string): ModuleKey | null {
  let best: { key: ModuleKey; len: number } | null = null;
  for (const def of MODULE_DEFS) {
    for (const path of def.paths) {
      if (pathname === path || pathname.startsWith(`${path}/`)) {
        if (!best || path.length > best.len) {
          best = { key: def.key, len: path.length };
        }
      }
    }
  }
  return best?.key ?? null;
}
