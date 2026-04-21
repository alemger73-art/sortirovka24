import { useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Home, Wrench, Newspaper, AlertTriangle, BookOpen, Megaphone, Briefcase, HelpCircle, Phone, Utensils, Sun, Moon, Globe, Bus } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { prefetchPage, routeToPage } from '@/lib/prefetch';

const NAV_KEYS = [
  { path: '/', key: 'nav.home', icon: Home },
  { path: '/masters', key: 'nav.masters', icon: Wrench },
  { path: '/news', key: 'nav.news', icon: Newspaper },
  { path: '/complaints', key: 'nav.complaints', icon: AlertTriangle },
  { path: '/announcements', key: 'nav.announcements', icon: Megaphone },
  { path: '/jobs', key: 'nav.jobs', icon: Briefcase },
  { path: '/questions', key: 'nav.questions', icon: HelpCircle },
  { path: '/food', key: 'nav.food', icon: Utensils },
  { path: '/transport', key: 'nav.transport', icon: Bus },
  { path: '/directory', key: 'nav.directory', icon: BookOpen },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLanguage();

  const toggleLang = () => setLang(lang === 'ru' ? 'kz' : 'ru');

  /** Prefetch page data on link hover/focus for instant transitions */
  const handlePrefetch = useCallback((path: string) => {
    const page = routeToPage(path);
    if (page) prefetchPage(page);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950 flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-50 border-b border-gray-100 dark:border-gray-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 flex items-center justify-center rounded bg-black dark:bg-white">
                <span className="text-white dark:text-black font-bold text-lg">С</span>
              </div>
              <div className="hidden sm:block">
                <span className="text-[18px] font-bold text-gray-900 dark:text-white">{t('header.portalName')}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 block -mt-1">{t('header.portalDesc')}</span>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {NAV_KEYS.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  onMouseEnter={() => handlePrefetch(item.path)}
                  onFocus={() => handlePrefetch(item.path)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {t(item.key)}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-1.5">
              {/* Language switcher */}
              <button
                onClick={toggleLang}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 group"
                aria-label="Сменить язык"
                title={lang === 'ru' ? 'Қазақша' : 'Русский'}
              >
                <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors uppercase tracking-wide">
                  {lang === 'ru' ? 'KZ' : 'RU'}
                </span>
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
                title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
              >
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5 text-yellow-400" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-600" />
                )}
              </button>

              {/* Admin panel link REMOVED — admin is hidden and accessible only via direct URL */}

              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {mobileOpen ? <X className="w-6 h-6 text-gray-900 dark:text-white" /> : <Menu className="w-6 h-6 text-gray-900 dark:text-white" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shadow-lg animate-in slide-in-from-top-2 duration-200">
            <nav className="max-w-7xl mx-auto px-4 py-3 space-y-1">
              {NAV_KEYS.map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    onMouseEnter={() => handlePrefetch(item.path)}
                    onFocus={() => handlePrefetch(item.path)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                      location.pathname === item.path
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {t(item.key)}
                  </Link>
                );
              })}

              {/* Language toggle in mobile menu */}
              <button
                onClick={() => { toggleLang(); }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 w-full min-h-[44px]"
              >
                <Globe className="w-5 h-5" />
                {lang === 'ru' ? 'Қазақ тілі' : 'Русский язык'}
              </button>

              {/* Admin panel link REMOVED from mobile menu */}
            </nav>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">С</span>
                </div>
                <span className="font-bold text-gray-900 dark:text-white">{t('footer.portalTitle')}</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('footer.portalDescription')}
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{t('footer.sections')}</h4>
              <div className="grid grid-cols-2 gap-2">
                {NAV_KEYS.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onMouseEnter={() => handlePrefetch(item.path)}
                    onFocus={() => handlePrefetch(item.path)}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {t(item.key)}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{t('footer.contacts')}</h4>
              <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>+7 (7212) 00-00-00</span>
                </div>
                <p>{t('footer.address')}</p>
                <p>sortirovka.portal@mail.ru</p>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 mt-6 pt-6 text-center text-sm text-gray-400 dark:text-gray-500">
            {t('footer.rights')}
          </div>
        </div>
      </footer>
    </div>
  );
}