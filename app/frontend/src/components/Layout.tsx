import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Home, Wrench, Newspaper, AlertTriangle, BookOpen, Megaphone, Briefcase, HelpCircle, Phone, Utensils, Bus, Car, Heart } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { prefetchPage, routeToPage } from '@/lib/prefetch';
import Header from '@/components/layout/Header';
import { AUTH_PROMPT_EVENT } from '@/lib/localAuth';
import AuthPromptModal from '@/components/ui/AuthPromptModal';
import { useTaxiEnabled } from '@/hooks/useTaxiEnabled';

import InstallAppBanner from '@/components/InstallAppBanner';
import { useSupportSettings } from '@/hooks/useSupportSettings';

const NAV_KEYS = [
  { path: '/', key: 'nav.home', icon: Home },
  { path: '/masters', key: 'nav.masters', icon: Wrench },
  { path: '/news', key: 'nav.news', icon: Newspaper },
  { path: '/complaints', key: 'nav.complaints', icon: AlertTriangle },
  { path: '/announcements', key: 'nav.announcements', icon: Megaphone },
  { path: '/jobs', key: 'nav.jobs', icon: Briefcase },
  { path: '/questions', key: 'nav.questions', icon: HelpCircle },
  { path: '/food', key: 'nav.food', icon: Utensils },
  { path: '/taxi', key: 'nav.taxi', icon: Car },
  { path: '/transport', key: 'nav.transport', icon: Bus },
  { path: '/directory', key: 'nav.directory', icon: BookOpen },
];

export default function Layout({ children, hideHeader = false }: { children: React.ReactNode; hideHeader?: boolean }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const taxiEnabled = useTaxiEnabled();
  const { promoEnabled: supportPromoEnabled } = useSupportSettings();
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [authRedirectTo, setAuthRedirectTo] = useState('/login');

  const navItems = NAV_KEYS.filter((item) => item.path !== '/taxi' || taxiEnabled !== false);

  /** Prefetch page data on link hover/focus for instant transitions */
  const handlePrefetch = useCallback((path: string) => {
    const page = routeToPage(path);
    if (page) prefetchPage(page);
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      const detail = (event as CustomEvent<{ redirectTo?: string }>).detail;
      setAuthRedirectTo(detail?.redirectTo || '/login');
      setAuthPromptOpen(true);
    };
    window.addEventListener(AUTH_PROMPT_EVENT, onPrompt as EventListener);
    return () => window.removeEventListener(AUTH_PROMPT_EVENT, onPrompt as EventListener);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950 flex flex-col transition-colors duration-300">
      {/* Header */}
      {!hideHeader && (
        <Header />
      )}

      {/* Main content */}
      <main className="flex-1">{children}</main>

      <AuthPromptModal
        open={authPromptOpen}
        onClose={() => setAuthPromptOpen(false)}
        onAuth={() => {
          setAuthPromptOpen(false);
          navigate(authRedirectTo);
        }}
      />

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 transition-colors duration-300 pb-[env(safe-area-inset-bottom)]">
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
              <Link
                to="/support"
                onMouseEnter={() => handlePrefetch('/support')}
                onFocus={() => handlePrefetch('/support')}
                className="inline-flex items-center gap-1.5 mt-3 text-sm text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors"
              >
                <Heart className="w-3.5 h-3.5" />
                {supportPromoEnabled ? t('footer.support') : t('footer.aboutProject')}
              </Link>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{t('footer.sections')}</h4>
              <div className="grid grid-cols-2 gap-2">
                {navItems.map(item => (
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

      <InstallAppBanner />
    </div>
  );
}