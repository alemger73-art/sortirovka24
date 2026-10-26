/**
 * «Ещё» — everything that is not in the bottom menu, in a clear order:
 * account card with «my stuff» shortcuts → main services as tiles → the rest as a short list → help → small legal links.
 * Disabled modules are hidden automatically; nothing is listed twice.
 */
import { getLegalDocuments } from '@/content/legal';
import { Link } from 'react-router-dom';
import {
  User, Bus, BookOpen, Car, Newspaper, AlertTriangle, HelpCircle, ShoppingBag, Shield, Heart, Landmark, Store,
  ChevronRight, LogIn, Cross, Wine, Bug, Megaphone, Package, Bell, Wrench, Scissors, Building2,
  MessageCircle, Hammer, History,
} from 'lucide-react';
import Layout from '@/components/Layout';
import InstallAppBanner from '@/components/InstallAppBanner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTaxiEnabled } from '@/hooks/useTaxiEnabled';
import { useModules } from '@/hooks/useModules';
import { moduleForPath } from '@/config/modules';
import { getAccountToken } from '@/lib/accountApi';
import { getCurrentUser } from '@/lib/localAuth';
import { formatKzPhone } from '@/lib/adKinds';
import { prefetchPage, routeToPage } from '@/lib/prefetch';

type Item = { path: string; icon: typeof User; tone: string; ru: string; kz: string; subRu?: string; subKz?: string; hidden?: boolean };
const SUPPORT_WA = 'https://wa.me/77004280280';

export default function More() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const tx = (ru: string, k: string) => (kz ? k : ru);
  const taxiEnabled = useTaxiEnabled();
  const { isEnabled } = useModules();
  const loggedIn = Boolean(getAccountToken());
  const user = loggedIn ? getCurrentUser() : null;
  const on = (i: Item) => !i.hidden && isEnabled(moduleForPath(i.path));
  const prefetch = (path: string) => { const page = routeToPage(path); if (page) prefetchPage(page); };

  // Main services: big tiles, two per row. DAM ALEM and «Объявления» are already in the bottom menu.
  const tiles: Item[] = [
    { path: '/news', icon: Newspaper, tone: 'bg-sky-600', ru: 'Новости', kz: 'Жаңалықтар', subRu: 'Что происходит рядом', subKz: 'Маңайда не болып жатыр' },
    { path: '/transport', icon: Bus, tone: 'bg-emerald-600', ru: 'Транспорт', kz: 'Көлік', subRu: 'Автобусы и расписание', subKz: 'Автобустар мен кесте' },
    { path: '/directory', icon: BookOpen, tone: 'bg-violet-600', ru: 'Справочник', kz: 'Анықтамалық', subRu: 'Полезные телефоны', subKz: 'Пайдалы телефондар' },
    { path: '/inspectors', icon: Shield, tone: 'bg-slate-600', ru: 'Участковые', kz: 'Учаскелік', subRu: 'Найти своего участкового', subKz: 'Учаскеліңізді табыңыз' },
    { path: '/taxi', icon: Car, tone: 'bg-yellow-500', ru: 'Такси', kz: 'Такси', subRu: 'Вызвать машину', subKz: 'Көлік шақыру', hidden: taxiEnabled !== true },
    { path: '/masters', icon: Wrench, tone: 'bg-blue-600', ru: 'Мастера', kz: 'Шеберлер', subRu: 'Ремонт и услуги', subKz: 'Жөндеу мен қызметтер' },
    { path: '/gastronom', icon: ShoppingBag, tone: 'bg-green-600', ru: 'Гастроном', kz: 'Гастроном', subRu: 'Продукты домой', subKz: 'Үйге азық-түлік' },
    { path: '/apteka', icon: Cross, tone: 'bg-teal-600', ru: 'Аптека', kz: 'Дәріхана', subRu: 'Лекарства с доставкой', subKz: 'Дәрі жеткізу' },
    { path: '/volna', icon: Wine, tone: 'bg-violet-700', ru: 'Волна', kz: 'Волна', subRu: 'Напитки', subKz: 'Сусындар' },
    { path: '/prorab', icon: Hammer, tone: 'bg-amber-700', ru: 'Прораб', kz: 'Прораб', subRu: 'Стройматериалы', subKz: 'Құрылыс материалдары' },
  ];
  // Everything else: a short list.
  const rest: Item[] = [
    { path: '/partners', icon: Store, tone: 'bg-emerald-600', ru: 'Партнёры района', kz: 'Аудан серіктестері', subRu: 'Проверенные компании рядом', subKz: 'Маңайдағы сенімді компаниялар' },
    { path: '/real-estate', icon: Landmark, tone: 'bg-cyan-600', ru: 'Недвижимость', kz: 'Жылжымайтын мүлік' },
    { path: '/salons', icon: Scissors, tone: 'bg-pink-500', ru: 'Салоны красоты', kz: 'Сұлулық салондары' },
    { path: '/complaints', icon: AlertTriangle, tone: 'bg-red-500', ru: 'Жалобы жителей', kz: 'Тұрғындар шағымы' },
    { path: '/questions', icon: HelpCircle, tone: 'bg-teal-600', ru: 'Вопросы и ответы', kz: 'Сұрақ-жауап' },
    { path: '/history', icon: History, tone: 'bg-stone-600', ru: 'История района', kz: 'Аудан тарихы' },
  ];
  const help: Item[] = [
    { path: '/support', icon: Heart, tone: 'bg-rose-500', ru: 'О проекте', kz: 'Жоба туралы' },
    { path: '/business', icon: Building2, tone: 'bg-indigo-600', ru: 'Для бизнеса', kz: 'Бизнеске', subRu: 'Разместить свою компанию', subKz: 'Компанияңызды орналастыру' },
    { path: '/report-problem', icon: Bug, tone: 'bg-amber-500', ru: 'Сообщить о проблеме', kz: 'Мәселе туралы хабарлау', subRu: 'Что-то не работает на сайте', subKz: 'Сайтта бірдеңе істемейді' },
  ];

  const shortcuts = [
    { path: '/cabinet?tab=orders', icon: Package, ru: 'Мои заказы', kz: 'Тапсырыстарым', show: isEnabled('food') },
    { path: '/cabinet?tab=announcements', icon: Megaphone, ru: 'Мои объявления', kz: 'Хабарландыруларым', show: isEnabled('announcements') },
    { path: '/cabinet?tab=notifications', icon: Bell, ru: 'Уведомления', kz: 'Хабарламалар', show: true },
  ].filter((s) => s.show);

  const listRow = (i: Item, index: number) => {
    const Icon = i.icon;
    return (
      <Link key={i.path} to={i.path} onMouseEnter={() => prefetch(i.path)} onFocus={() => prefetch(i.path)}
        className={`flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800 ${index ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${i.tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-gray-900 dark:text-white">{kz ? i.kz : i.ru}</span>
          {i.subRu && <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{kz ? i.subKz : i.subRu}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" aria-hidden />
      </Link>
    );
  };
  const group = (title: string, items: Item[]) => {
    const visible = items.filter(on);
    if (!visible.length) return null;
    return (
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{title}</h2>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">{visible.map(listRow)}</div>
      </section>
    );
  };
  const visibleTiles = tiles.filter(on);
  const initial = (user?.name || '').trim().charAt(0).toUpperCase();

  return (
    <Layout>
      <div className="mx-auto max-w-lg space-y-5 px-4 pb-10 pt-5 md:max-w-3xl md:pt-8 lg:max-w-5xl">
        <h1 className="px-1 text-2xl font-bold text-gray-900 dark:text-white">{tx('Ещё', 'Тағы')}</h1>
        {/* Account */}
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-blue-900 p-5 text-white shadow-sm">
          {loggedIn ? (
            <Link to="/cabinet" className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold">{initial || <User className="h-7 w-7" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{user?.name || tx('Мой кабинет', 'Менің кабинетім')}</span>
                <span className="block text-sm text-white/75">{(user?.phone && formatKzPhone(user.phone)) || tx('Профиль и настройки', 'Профиль және баптаулар')}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-white/70" aria-hidden />
            </Link>
          ) : (
            <div>
              <p className="text-lg font-bold">{tx('Войдите в аккаунт', 'Аккаунтқа кіріңіз')}</p>
              <p className="mt-1 text-sm text-white/80">{tx('Заказы, объявления и уведомления — в одном месте. Вход по номеру телефона.', 'Тапсырыстар, хабарландырулар және хабарламалар бір жерде. Телефон нөмірі арқылы кіру.')}</p>
              <Link to="/login" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-slate-900"><LogIn className="h-5 w-5" />{tx('Войти', 'Кіру')}</Link>
            </div>
          )}
          {loggedIn && shortcuts.length > 0 && (
            <div className={`mt-4 grid gap-2 ${shortcuts.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {shortcuts.map((s) => (
                <Link key={s.path} to={s.path} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 px-2 py-3 text-center text-xs font-medium hover:bg-white/15">
                  <s.icon className="h-5 w-5" aria-hidden />{kz ? s.kz : s.ru}
                </Link>
              ))}
            </div>
          )}
        </section>

        <InstallAppBanner manual />

        {/* Main services */}
        {visibleTiles.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{tx('Сервисы', 'Қызметтер')}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {visibleTiles.map((i) => {
                const Icon = i.icon;
                return (
                  <Link key={i.path} to={i.path} onMouseEnter={() => prefetch(i.path)} onFocus={() => prefetch(i.path)}
                    className="flex min-h-[112px] flex-col rounded-2xl border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-white ${i.tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
                    <span className="mt-3 text-[15px] font-semibold leading-tight text-gray-900 dark:text-white">{kz ? i.kz : i.ru}</span>
                    <span className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{kz ? i.subKz : i.subRu}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
          {group(tx('Ещё в районе', 'Аудандағы басқалар'), rest)}
          {group(tx('Помощь и проект', 'Көмек және жоба'), help)}
        </div>

        <a href={SUPPORT_WA} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white"><MessageCircle className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-gray-900 dark:text-white">{tx('Написать в поддержку', 'Қолдау қызметіне жазу')}</span>
            <span className="block text-xs text-gray-600 dark:text-gray-300">WhatsApp · +7 700 428 02 80</span>
          </span>
          <ChevronRight className="h-4 w-4 text-green-600" aria-hidden />
        </a>

        <nav className="flex flex-wrap gap-x-4 gap-y-2 px-1 pt-2 text-xs text-gray-400 dark:text-gray-500" aria-label={tx('Документы', 'Құжаттар')}>
          {Object.entries(getLegalDocuments(lang)).map(([key, item]) => <Link key={key} className="hover:text-gray-600 hover:underline" to={`/legal/${key}`}>{item.title}</Link>)}
        </nav>
      </div>
    </Layout>
  );
}
