/** Live countdown to midnight 1 January 2027 in Almaty; after midnight it turns into the greeting from the admin panel. */
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { NEW_YEAR_AT } from '@/lib/seasonal';
import ChristmasDecor from './ChristmasDecor';
import FrostedCard from './FrostedCard';
import { useSeasonal } from './SeasonalThemeProvider';

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

/** Russian needs one/few/many forms; Kazakh has one form, so its entries repeat it. */
function pick(forms: string, n: number): string {
  const [one, few, many] = forms.split('|');
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few ?? one;
  return many ?? one;
}

function Tree() {
  return (
    <svg viewBox="0 0 20 24" width="16" height="20" aria-hidden="true" className="ny-cd-tree">
      <path d="M10 1 4 9h3l-4 6h4l-4 6h14l-4-6h4l-4-6h3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 21v2.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export default function NewYearCountdown() {
  const { active, settings, userStill, setUserStill } = useSeasonal();
  const { t, lang } = useLanguage();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !settings.countdown || Date.now() >= NEW_YEAR_AT) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active, settings.countdown]);

  if (!active || !settings.countdown) return null;
  const left = NEW_YEAR_AT - now;
  const done = left <= 0;
  const p = parts(left);
  const cells = [
    { n: p.days, label: pick(t('ny.unit.days'), p.days) },
    { n: p.hours, label: pick(t('ny.unit.hours'), p.hours) },
    { n: p.minutes, label: t('ny.unit.minutes') },
    { n: p.seconds, label: t('ny.unit.seconds') },
  ];
  const [before, after] = t('ny.countdown.title').split('2027');
  const greeting = lang === 'kz' ? settings.greeting_kz : settings.greeting_ru;

  return (
    <section className="ny-cd" aria-label={done ? greeting : t('ny.countdown.title')}>
      <ChristmasDecor kind="lantern" />
      <ChristmasDecor kind="snowman" />
      <div className="ny-cd-in">
        {done ? (
          <p className="ny-cd-greeting">{greeting}</p>
        ) : (
          <>
            <h2 className="ny-cd-title"><Tree /><span>{before}<b>2027</b>{after}</span><Tree /></h2>
            <div className="ny-cd-cells" role="timer" aria-live="off">
              {cells.map((c, i) => (
                <FrostedCard key={i} className="ny-cd-cell">
                  <strong>{String(c.n).padStart(2, '0')}</strong>
                  <span>{c.label}</span>
                </FrostedCard>
              ))}
            </div>
          </>
        )}
        {settings.snow && (
          <button type="button" className="ny-cd-still" onClick={() => setUserStill(!userStill)} aria-pressed={userStill}>
            {userStill ? t('ny.motion.on') : t('ny.motion.off')}
          </button>
        )}
      </div>
    </section>
  );
}
