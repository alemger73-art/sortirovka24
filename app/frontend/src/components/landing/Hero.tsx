import { Link } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Megaphone, Car, Newspaper, ShoppingBag, Utensils, Wrench, Users, Coffee, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTaxiEnabled } from '@/hooks/useTaxiEnabled';
import { useModules } from '@/hooks/useModules';
import { useHomepageHeroStats, type HeroStatItem } from '@/hooks/useHomepageHeroStats';
import WeatherWidget from '@/components/landing/WeatherWidget';
import '@/styles/portal-public.css';
const image='https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505696/legacy-images/9ee7277f8db9a4a5521e.png';
const icons:Record<HeroStatItem['labelKey'],typeof Users>={'hero.mastersShort':Users,'hero.cafesShort':Coffee,'hero.residentsShort':ShieldCheck};
export default function Hero(){
 const {t,lang}=useLanguage();const kz=lang==='kz';const {isEnabled}=useModules();const taxi=useTaxiEnabled();const {visible,items}=useHomepageHeroStats();
 const links=[
  {to:'/news',icon:Newspaper,label:kz?'Жаңалықтар':'Новости',detail:kz?'Ауданда не болып жатыр':'Что происходит в районе',enabled:isEnabled('news')},
  {to:'/announcements',icon:Megaphone,label:kz?'Хабарландырулар':'Объявления',detail:kz?'Сату, сатып алу, жұмыс — тегін':'Продать, купить, работа — бесплатно',enabled:isEnabled('announcements')},
  {to:'/directory',icon:BookOpen,label:kz?'АНЫҚТАМАЛЫҚ':'СПРАВОЧНИК',detail:kz?'Учаскелік инспекторлар және автобус кестелері':'Участковые и расписание автобусов',enabled:isEnabled('directory')},
  {to:'/food',icon:Utensils,label:t('hero.food'),detail:t('hero.foodDesc'),enabled:isEnabled('food')},
  {to:'/masters',icon:Wrench,label:t('hero.mastersBtn'),detail:t('hero.mastersDesc'),enabled:isEnabled('masters')},
  {to:'/gastronom',icon:ShoppingBag,label:t('hero.gastronom'),detail:t('hero.gastronomDesc'),enabled:isEnabled('gastronom')},
  {to:'/taxi',icon:Car,label:t('hero.taxi'),detail:t('hero.taxiDesc'),enabled:taxi===true},
 ].filter(x=>x.enabled);
 return <section className="portal-hero"><div className="portal-hero-photo"><img src={image} alt="" fetchPriority="high"/></div><div className="portal-hero-inner"><div className="portal-hero-top"><span className="portal-hero-location">{kz?'Қарағанды · Сортировка':'Караганда · Сортировка'}</span><WeatherWidget/></div><h1>{kz?'Сіздің ауданыңыз.':'Ваш район.'}<br/><span>{kz?'Бәрі осында.':'Всё здесь.'}</span></h1><p className="portal-hero-intro">{kz?'Жаңалықтар, пайдалы байланыстар және күнделікті қызметтер. Сортировка тұрғындарына арналған портал.':'Новости, полезные контакты и повседневные услуги. Портал для жителей Сортировки.'}</p><div className="portal-hero-links">{links.map(({to,icon:Icon,label,detail})=><Link key={to} to={to}><div className="portal-entry-icon"><Icon size={23}/></div><div><strong>{label}</strong><small>{detail}</small></div><ArrowUpRight size={19} className="portal-entry-arrow"/></Link>)}</div>{visible&&items.length>0&&<div className="portal-hero-stats">{items.map(item=>{const Icon=icons[item.labelKey];return <div key={item.labelKey}><Icon size={17}/><strong>{item.value}+</strong><span>{t(item.labelKey)}</span></div>;})}</div>}</div></section>;
}
