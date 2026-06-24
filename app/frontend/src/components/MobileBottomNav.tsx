import { Link, useLocation } from 'react-router-dom';
import { Home, Utensils, Megaphone, Wrench, LayoutGrid } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { isMoreTabActive } from '@/lib/appShell';
import { prefetchPage, routeToPage } from '@/lib/prefetch';
import { useModules } from '@/hooks/useModules';
import type { ModuleKey } from '@/config/modules';

const TABS = [
  { path: '/', key: 'nav.home', icon: Home, match: (p: string) => p === '/' },
  {
    path: '/food',
    key: 'nav.food',
    icon: Utensils,
    module: 'food' as ModuleKey,
    match: (p: string) =>
      p === '/food' ||
      (p.startsWith('/food/') && !p.startsWith('/food/courier') && !p.startsWith('/food/park')),
  },
  {
    path: '/announcements',
    key: 'nav.announcements',
    icon: Megaphone,
    module: 'announcements' as ModuleKey,
    match: (p: string) => p.startsWith('/announcements') || p.startsWith('/ads'),
  },
  { path: '/masters', key: 'nav.masters', icon: Wrench, module: 'masters' as ModuleKey, match: (p: string) => p.startsWith('/masters') },
  { path: '/more', key: 'nav.more', icon: LayoutGrid, match: (p: string) => isMoreTabActive(p) },
] as const;

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const { isEnabled } = useModules();
  const tabs = TABS.filter((tab) => !('module' in tab) || isEnabled(tab.module));

  const handlePrefetch = (path: string) => {
    const page = routeToPage(path);
    if (page) prefetchPage(page);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/95 pb-[env(safe-area-inset-bottom)]"
      aria-label={t('nav.bottomBar')}
      data-bottom-nav
    >
      <div className="mx-auto flex max-w-lg">
        {tabs.map(({ path, key, icon: Icon, match }) => {
          const active = match(pathname);

          return (
            <Link
              key={path}
              to={path}
              onMouseEnter={() => handlePrefetch(path)}
              onFocus={() => handlePrefetch(path)}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] touch-manipulation transition-colors ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'stroke-[2.5px]' : ''}`} aria-hidden />
              <span className={`text-[10px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
                {t(key)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
