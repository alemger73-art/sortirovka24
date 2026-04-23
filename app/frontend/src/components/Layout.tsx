import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Home, Wrench, Newspaper, AlertTriangle, BookOpen, Megaphone, Briefcase, HelpCircle, Phone, Utensils, Bus } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { prefetchPage, routeToPage } from '@/lib/prefetch';
import Header from '@/components/layout/Header';

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

export default function Layout({ children, hideHeader = false }: { children: React.ReactNode; hideHeader?: boolean }) {
  const { t } = useLanguage();

  /** Prefetch page data on link hover/focus for instant transitions */
  const handlePrefetch = useCallback((path: string) => {
    const page = routeToPage(path);
    if (page) prefetchPage(page);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950 flex flex-col transition-colors duration-300">
      {/* Header */}
      {!hideHeader && (
        <Header />
      )}

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