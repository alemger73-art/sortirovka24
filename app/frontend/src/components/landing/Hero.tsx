/** Home page top: a photo card of the district and three main services (design «Городской сервис»). */
import { Link } from 'react-router-dom';
import { BookOpen, MapPin, Megaphone, Utensils } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules } from '@/hooks/useModules';
import WeatherWidget from '@/components/landing/WeatherWidget';
import '@/styles/home-v2.css';

const image = 'https://res.cloudinary.com/djpdmlkr9/image/upload/w_1400,q_auto,f_auto/v1792505696/legacy-images/9ee7277f8db9a4a5521e.png';

export default function Hero() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const { isEnabled } = useModules();
  const tiles = [
    { to: '/announcements', icon: Megaphone, food: false, label: kz ? 'Хабарландыру' : 'Объявления', detail: kz ? 'Сату, сатып алу, жұмыс' : 'Купить, продать, работа', on: isEnabled('announcements') },
    { to: '/food', icon: Utensils, food: true, label: kz ? 'Тамақ' : 'Еда', detail: kz ? 'DAM ALEM, жеткізу' : 'DAM ALEM, доставка', on: isEnabled('food') },
    { to: '/directory', icon: BookOpen, food: false, label: kz ? 'Анықтамалық' : 'Справочник', detail: kz ? 'Учаскелік, автобустар, телефондар' : 'Участковые, автобусы, телефоны', on: isEnabled('directory') },
  ].filter((x) => x.on);
  return (
    <section aria-label={kz ? 'Басты бет' : 'Главное'}>
      <div className="h2-hero">
        <img src={image} alt="" fetchPriority="high" />
        <div className="h2-hero-top">
          <span className="h2-chip-glass"><MapPin size={14} />{kz ? 'Сортировка, Қарағанды' : 'Сортировка, Караганда'}</span>
          <WeatherWidget />
        </div>
        <div className="h2-hero-copy">
          <h1>{kz ? <>Аудан туралы бәрі —<br />бір жерде</> : <>Всё о районе —<br />в одном месте</>}</h1>
        </div>
      </div>
      {tiles.length > 0 && (
        <nav className="h2-tiles" aria-label={kz ? 'Негізгі сервистер' : 'Главные сервисы'} style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
          {tiles.map(({ to, icon: Icon, food, label, detail }) => (
            <Link key={to} to={to} className="h2-card h2-tile">
              <span className={`h2-ico${food ? ' food' : ''}`}><Icon size={20} strokeWidth={1.8} /></span>
              <span><strong>{label}</strong><small>{detail}</small></span>
            </Link>
          ))}
        </nav>
      )}
    </section>
  );
}
