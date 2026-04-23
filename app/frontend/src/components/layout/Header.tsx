import { useState, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, MapPin, Globe, Moon, Sun } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { prefetchPage, routeToPage } from '@/lib/prefetch';
import { getCurrentUser, logoutLocalUser, onAuthChanged } from '@/lib/localAuth';

const NAV_ITEMS = [
  { path: '/', key: 'nav.home' },
  { path: '/masters', key: 'nav.masters' },
  { path: '/announcements', key: 'nav.announcements' },
  { path: '/news', key: 'nav.news' },
  { path: '/jobs', key: 'nav.jobs' },
  { path: '/complaints', key: 'nav.complaints' },
  { path: '/food', key: 'nav.food' },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState(getCurrentUser());
  const location = useLocation();
  const { lang, setLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const toggleLang = () => setLang(lang === 'ru' ? 'kz' : 'ru');

  const handlePrefetch = useCallback((path: string) => {
    const page = routeToPage(path);
    if (page) prefetchPage(page);
  }, []);

  useEffect(() => {
    return onAuthChanged(() => setUser(getCurrentUser()));
  }, []);

  const isActivePath = useCallback(
    (itemPath: string) => {
      const current = location.pathname;
      if (itemPath === '/') return current === '/';
      if (itemPath === '/announcements' && current.startsWith('/ads')) return true;
      return current === itemPath || current.startsWith(`${itemPath}/`);
    },
    [location.pathname]
  );

  return (
    <header className="theme-transition relative z-50 border-b border-app bg-app-header shadow-[0_4px_20px_rgba(0,0,0,0.25)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400/15">
            <MapPin className="h-5 w-5 text-yellow-300" />
          </div>
          <div className="leading-tight">
            <p className="text-base font-bold text-app">{t('header.portalName')}</p>
            <p className="text-xs text-app-muted">{t('header.portalDesc')}</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onMouseEnter={() => handlePrefetch(item.path)}
                onFocus={() => handlePrefetch(item.path)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'text-yellow-300'
                    : 'text-app hover:text-yellow-200'
                }`}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                to="/cabinet"
                className="hidden rounded-lg bg-app-card px-3 py-2 text-sm font-semibold text-app theme-transition hover:opacity-90 sm:inline-flex"
              >
                {t('cabinet.title')}
              </Link>
              <button
                onClick={logoutLocalUser}
                className="hidden rounded-lg border border-app px-3 py-2 text-sm font-semibold text-app theme-transition hover:bg-app-surface sm:inline-flex"
              >
                {t('auth.logout')}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="hidden rounded-lg bg-app-card px-3 py-2 text-sm font-semibold text-app theme-transition hover:opacity-90 sm:inline-flex"
            >
              {t('auth.login')}
            </Link>
          )}
          <button
            onClick={toggleTheme}
            className="inline-flex items-center gap-1 rounded-lg border border-app px-2.5 py-2 text-sm font-semibold text-app theme-transition hover:bg-app-surface"
            aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
            title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={toggleLang}
            className="inline-flex items-center gap-1 rounded-lg border border-app px-2.5 py-2 text-sm font-semibold text-app theme-transition hover:bg-app-surface"
            aria-label={t('lang.switch')}
            title={lang === 'ru' ? t('lang.kz') : t('lang.ru')}
          >
            <Globe className="h-4 w-4" />
            {lang === 'ru' ? 'KZ' : 'RU'}
          </button>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg p-2 text-app theme-transition hover:bg-app-surface lg:hidden"
            aria-label={t('header.openMenu')}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="theme-transition border-t border-app bg-app-header px-4 py-3 lg:hidden">
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  onMouseEnter={() => handlePrefetch(item.path)}
                  onFocus={() => handlePrefetch(item.path)}
                  className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'text-yellow-300'
                      : 'text-app hover:text-yellow-200'
                  }`}
                >
                  {t(item.key)}
                </Link>
              );
            })}
            {user ? (
              <>
                <Link
                  to="/cabinet"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 block rounded-lg bg-app-card px-3 py-2.5 text-center text-sm font-semibold text-app theme-transition hover:opacity-90"
                >
                  {t('cabinet.title')}
                </Link>
                <button
                  onClick={() => {
                    logoutLocalUser();
                    setMobileOpen(false);
                  }}
                  className="mt-2 w-full rounded-lg border border-app px-3 py-2.5 text-center text-sm font-semibold text-app theme-transition hover:bg-app-surface"
                >
                  {t('auth.logout')}
                </button>
              </>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="mt-2 block rounded-lg bg-app-card px-3 py-2.5 text-center text-sm font-semibold text-app theme-transition hover:opacity-90"
              >
                {t('auth.login')}
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
