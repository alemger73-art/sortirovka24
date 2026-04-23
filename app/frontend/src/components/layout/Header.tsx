import { useState, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, MapPin, Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { prefetchPage, routeToPage } from '@/lib/prefetch';
import { getCurrentUser, logoutLocalUser, onAuthChanged } from '@/lib/localAuth';

const NAV_ITEMS = [
  { path: '/', label: 'Главная' },
  { path: '/masters', label: 'Мастера' },
  { path: '/announcements', label: 'Объявления' },
  { path: '/news', label: 'Новости' },
  { path: '/jobs', label: 'Работа' },
  { path: '/complaints', label: 'Жалобы' },
  { path: '/food', label: 'Еда' },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState(getCurrentUser());
  const location = useLocation();
  const { lang, setLang } = useLanguage();

  const toggleLang = () => setLang(lang === 'ru' ? 'kz' : 'ru');

  const handlePrefetch = useCallback((path: string) => {
    const page = routeToPage(path);
    if (page) prefetchPage(page);
  }, []);

  useEffect(() => {
    return onAuthChanged(() => setUser(getCurrentUser()));
  }, []);

  return (
    <header className="relative z-50 border-b border-white/10 bg-slate-950/75 shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400/15">
            <MapPin className="h-5 w-5 text-yellow-300" />
          </div>
          <div className="leading-tight">
            <p className="text-base font-bold text-white">Сортировка 24</p>
            <p className="text-xs text-white/60">портал района</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onMouseEnter={() => handlePrefetch(item.path)}
                onFocus={() => handlePrefetch(item.path)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                to="/cabinet"
                className="hidden rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100 sm:inline-flex"
              >
                Кабинет
              </Link>
              <button
                onClick={logoutLocalUser}
                className="hidden rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 sm:inline-flex"
              >
                Выйти
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="hidden rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100 sm:inline-flex"
            >
              Войти
            </Link>
          )}
          <button
            onClick={toggleLang}
            className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-2.5 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10"
            aria-label="Сменить язык"
            title={lang === 'ru' ? 'Қазақша' : 'Русский'}
          >
            <Globe className="h-4 w-4" />
            {lang === 'ru' ? 'KZ' : 'RU'}
          </button>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg p-2 text-white hover:bg-white/10 lg:hidden"
            aria-label="Открыть меню"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-slate-950/90 px-4 py-3 lg:hidden">
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  onMouseEnter={() => handlePrefetch(item.path)}
                  onFocus={() => handlePrefetch(item.path)}
                  className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {user ? (
              <>
                <Link
                  to="/cabinet"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 block rounded-lg bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-900 hover:bg-gray-100"
                >
                  Кабинет
                </Link>
                <button
                  onClick={() => {
                    logoutLocalUser();
                    setMobileOpen(false);
                  }}
                  className="mt-2 w-full rounded-lg border border-white/20 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-white/10"
                >
                  Выйти
                </button>
              </>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="mt-2 block rounded-lg bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-900 hover:bg-gray-100"
              >
                Войти
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
