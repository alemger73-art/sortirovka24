/** Home page top (design A): district photo, a short title and two glass tiles — Справочник and DAM ALEM. */
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules } from '@/hooks/useModules';
import WeatherWidget from '@/components/landing/WeatherWidget';
import { BookOpen, Utensils } from 'lucide-react';
import SeasonalBackground from '@/components/seasonal/SeasonalBackground';
import ChristmasDecor from '@/components/seasonal/ChristmasDecor';
import { useSeasonal } from '@/components/seasonal/SeasonalThemeProvider';
import '@/styles/home-a.css';

const image = 'https://res.cloudinary.com/djpdmlkr9/image/upload/w_1400,q_auto,f_auto/v1792505696/legacy-images/9ee7277f8db9a4a5521e.png';

export default function Hero() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const { isEnabled } = useModules();
  const { active: ny, settings } = useSeasonal();
  const tiles = [
    { to: '/directory', label: kz ? 'Анықтамалық' : 'Справочник', detail: kz ? 'Ауданның пайдалы телефондары' : 'Полезные телефоны района', on: isEnabled('directory'), tone: 'ice', Icon: BookOpen },
    { to: '/food', label: 'DAM ALEM 2.0', detail: kz ? 'Ыстық тағам жеткізу' : 'Горячая еда с доставкой', on: isEnabled('food'), tone: 'berry', Icon: Utensils },
  ].filter((t) => t.on);
  const [script, ...rest] = (kz ? settings.title_kz : settings.title_ru).split(' ');
  return (
    <section className="a-hero" aria-label={kz ? 'Басты бет' : 'Главное'}>
      <SeasonalBackground fallback={image} />
      <ChristmasDecor kind="spruce" className="ny-hero-spruce" />
      <div className="a-hero-in">
        <div className="a-hero-top">
          <div>
            <span className="a-kicker-hero">{kz ? 'АУДАН ПОРТАЛЫ' : 'ПОРТАЛ РАЙОНА'}</span>
            {ny ? (
              <h1 className="ny-hero-title">Сортировка 24<span className="ny-script">{script}</span><span className="ny-script-rest">{rest.join(' ')}</span></h1>
            ) : (
              <h1>{kz ? <>Сортировка<br />сізге жақын</> : <>Сортировка<br />рядом с вами</>}</h1>
            )}
          </div>
          <WeatherWidget />
        </div>
        {tiles.length > 0 && (
          <nav className="a-hero-tiles" aria-label={kz ? 'Негізгі сервистер' : 'Главные сервисы'}>
            {tiles.map((t) => (
              <Link key={t.to} to={t.to} className={`a-hero-tile ny-frost ny-frost-${t.tone}`}>
                {ny && <span className="ny-tile-icon" aria-hidden="true"><t.Icon size={19} strokeWidth={1.8} /></span>}
                <strong>{t.label}</strong><small>{t.detail}</small>
                {t.tone === 'berry' && <ChristmasDecor kind="gift" />}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
