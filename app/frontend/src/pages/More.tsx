import { Link } from 'react-router-dom';
import {
  User, Bus, BookOpen, Car, Newspaper, AlertTriangle, Briefcase, HelpCircle,
  ShoppingBag, Shield, Heart, Landmark, Store, UtensilsCrossed, ChevronRight, LogIn, Cross, Wine, Bug,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTaxiEnabled } from '@/hooks/useTaxiEnabled';
import { useModules } from '@/hooks/useModules';
import { moduleForPath } from '@/config/modules';
import { getAccountToken } from '@/lib/accountApi';
import { prefetchPage, routeToPage } from '@/lib/prefetch';

type MoreItem = {
  path: string;
  key: string;
  icon: typeof User;
  accent: string;
  hidden?: boolean;
};

export default function More() {
  const { t } = useLanguage();
  const taxiEnabled = useTaxiEnabled();
  const { isEnabled } = useModules();
  const isLoggedIn = Boolean(getAccountToken());

  const sections: { titleKey: string; items: MoreItem[] }[] = [
    {
      titleKey: 'more.sectionAccount',
      items: [
        {
          path: isLoggedIn ? '/cabinet' : '/login',
          key: isLoggedIn ? 'cabinet.title' : 'auth.login',
          icon: isLoggedIn ? User : LogIn,
          accent: 'bg-blue-600',
        },
      ],
    },
    {
      titleKey: 'more.sectionServices',
      items: [
        { path: '/transport', key: 'nav.transport', icon: Bus, accent: 'bg-emerald-600' },
        { path: '/directory', key: 'nav.directory', icon: BookOpen, accent: 'bg-violet-600' },
        { path: '/taxi', key: 'nav.taxi', icon: Car, accent: 'bg-amber-500', hidden: taxiEnabled === false },
        { path: '/food/restaurants', key: 'more.foodRestaurants', icon: UtensilsCrossed, accent: 'bg-orange-500' },
        { path: '/gastronom', key: 'more.gastronom', icon: ShoppingBag, accent: 'bg-green-600' },
        { path: '/volna', key: 'more.volna', icon: Wine, accent: 'bg-violet-700' },
        { path: '/apteka', key: 'more.pharmacy', icon: Cross, accent: 'bg-teal-600' },
        { path: '/inspectors', key: 'more.inspectors', icon: Shield, accent: 'bg-slate-600' },
      ],
    },
    {
      titleKey: 'more.sectionCommunity',
      items: [
        { path: '/news', key: 'nav.news', icon: Newspaper, accent: 'bg-sky-600' },
        { path: '/complaints', key: 'nav.complaints', icon: AlertTriangle, accent: 'bg-red-500' },
        { path: '/jobs', key: 'nav.jobs', icon: Briefcase, accent: 'bg-indigo-600' },
        { path: '/questions', key: 'nav.questions', icon: HelpCircle, accent: 'bg-teal-600' },
        { path: '/real-estate', key: 'more.realEstate', icon: Landmark, accent: 'bg-cyan-600' },
        { path: '/business', key: 'more.business', icon: Store, accent: 'bg-pink-600' },
        { path: '/history', key: 'more.history', icon: Landmark, accent: 'bg-stone-600' },
      ],
    },
    {
      titleKey: 'more.sectionAbout',
      items: [
        { path: '/support', key: 'footer.aboutProject', icon: Heart, accent: 'bg-rose-500' },
        { path: '/report-problem', key: 'more.reportProblem', icon: Bug, accent: 'bg-amber-500' },
      ],
    },
  ];

  const prefetch = (path: string) => {
    const page = routeToPage(path);
    if (page) prefetchPage(page);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 py-5 md:max-w-3xl md:py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.more')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('more.subtitle')}</p>

        <div className="mt-6 space-y-6">
          {sections.map(({ titleKey, items }) => {
            const visible = items.filter((item) => !item.hidden && isEnabled(moduleForPath(item.path)));
            if (visible.length === 0) return null;

            return (
              <section key={titleKey}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t(titleKey)}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  {visible.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onMouseEnter={() => prefetch(item.path)}
                        onFocus={() => prefetch(item.path)}
                        className={`flex min-h-[56px] items-center gap-3 px-4 py-3.5 touch-manipulation transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800 dark:active:bg-gray-800/80 ${
                          index > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''
                        }`}
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${item.accent}`}>
                          <Icon className="h-5 w-5" aria-hidden />
                        </div>
                        <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">
                          {t(item.key)}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" aria-hidden />
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
