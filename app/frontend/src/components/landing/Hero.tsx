/** Home page top (design A): district photo, a short title and two glass tiles — Справочник and DAM ALEM. */
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules } from '@/hooks/useModules';
import WeatherWidget from '@/components/landing/WeatherWidget';
import '@/styles/home-a.css';

const image = 'https://res.cloudinary.com/djpdmlkr9/image/upload/w_1400,q_auto,f_auto/v1792505696/legacy-images/9ee7277f8db9a4a5521e.png';

export default function Hero() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const { isEnabled } = useModules();
  const tiles = [
    { to: '/directory', label: kz ? 'Анықтамалық' : 'Справочник', detail: kz ? 'Учаскелік инспекторлар және автобус кестесі' : 'Участковые и расписание автобусов', on: isEnabled('directory') },
    { to: '/food', label: 'DAM ALEM 2.0', detail: kz ? 'Ыстық тағам жеткізу' : 'Горячая еда с доставкой', on: isEnabled('food') },
  ].filter((t) => t.on);
  return (
    <section className="a-hero" aria-label={kz ? 'Басты бет' : 'Главное'}>
      <img src={image} alt="" fetchPriority="high" />
      <div className="a-hero-in">
        <div className="a-hero-top">
          <div>
            <span className="a-kicker-hero">{kz ? 'АУДАН ПОРТАЛЫ' : 'ПОРТАЛ РАЙОНА'}</span>
            <h1>{kz ? <>Сортировка<br />сізге жақын</> : <>Сортировка<br />рядом с вами</>}</h1>
          </div>
          <WeatherWidget />
        </div>
        {tiles.length > 0 && (
          <nav className="a-hero-tiles" aria-label={kz ? 'Негізгі сервистер' : 'Главные сервисы'}>
            {tiles.map((t) => (
              <Link key={t.to} to={t.to} className="a-hero-tile"><strong>{t.label}</strong><small>{t.detail}</small></Link>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
