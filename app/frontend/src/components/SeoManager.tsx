import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://www.sortirovka24.kz';
const DEFAULT_TITLE = 'Сортировка 24 — цифровой портал района';
const DEFAULT_DESCRIPTION =
  'Новости района Сортировка в Караганде, объявления, работа, полезный справочник, расписание транспорта и доставка еды DÄM ALEM.';

type PageMeta = { title: string; description: string };

const PAGE_META: Array<[string, PageMeta]> = [
  ['/announcements', { title: 'Объявления района Сортировка', description: 'Актуальные объявления жителей района Сортировка в Караганде.' }],
  ['/real-estate', { title: 'Недвижимость на Сортировке', description: 'Объявления о продаже и аренде недвижимости в районе Сортировка, Караганда.' }],
  ['/directory', { title: 'Полезный справочник Сортировки', description: 'Телефоны и контакты важных служб района Сортировка в Караганде.' }],
  ['/transport', { title: 'Расписание автобусов Сортировки', description: 'Маршруты, остановки и расписание автобусов района Сортировка.' }],
  ['/inspectors', { title: 'Участковые инспекторы Сортировки', description: 'Контакты участковых инспекторов и отделов полиции района Сортировка.' }],
  ['/business', { title: 'Бизнес района Сортировка', description: 'Местные компании, магазины и услуги района Сортировка в Караганде.' }],
  ['/masters', { title: 'Мастера на Сортировке', description: 'Каталог проверенных мастеров и услуг в районе Сортировка.' }],
  ['/food', { title: 'DÄM ALEM — доставка еды на Сортировке', description: 'Закажите UFO-бургеры, пиццу, закуски и напитки с доставкой по району Сортировка.' }],
  ['/news', { title: 'Новости района Сортировка', description: 'Последние новости и события района Сортировка в Караганде.' }],
  ['/jobs', { title: 'Работа на Сортировке', description: 'Свежие вакансии и предложения работы в районе Сортировка.' }],
  ['/questions', { title: 'Вопросы жителей Сортировки', description: 'Вопросы и полезные ответы для жителей района Сортировка.' }],
  ['/complaints', { title: 'Обращения жителей Сортировки', description: 'Обращения и проблемы жителей района Сортировка в Караганде.' }],
  ['/support', { title: 'Поддержать Сортировку 24', description: 'Поддержка развития цифрового портала района Сортировка.' }],
  ['/', { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION }],
];

const PRIVATE_PREFIXES = [
  '/admin', '/partner', '/cabinet', '/account', '/login', '/register',
  '/system-portal-924', '/delivery', '/taxi/ride', '/auth',
];

function setMeta(selector: string, attribute: string, value: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element) element.setAttribute(attribute, value);
}

export default function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const privatePage = PRIVATE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const entry = PAGE_META.find(([prefix]) => prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`));
    const meta = entry?.[1] ?? { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
    const title = meta.title === DEFAULT_TITLE ? meta.title : `${meta.title} | Сортировка 24`;
    const cleanPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
    const canonical = `${SITE_URL}${cleanPath}`;

    document.title = title;
    setMeta('meta[name="description"]', 'content', meta.description);
    setMeta('meta[name="robots"]', 'content', privatePage || !entry ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', meta.description);
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', meta.description);

    const canonicalElement = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    canonicalElement?.setAttribute('href', canonical);
  }, [pathname]);

  return null;
}
