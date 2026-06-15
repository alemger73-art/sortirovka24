import { useEffect, useState } from 'react';
import { hideNativeSplash } from '@/lib/native';

const MIN_VISIBLE_MS = 1700;
const FADE_OUT_MS = 500;

type Props = {
  onHidden: () => void;
};

export default function AppWelcomeSplash({ onHidden }: Props) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    document.getElementById('boot-splash')?.remove();
    void hideNativeSplash();

    const started = performance.now();
    let fadeTimer: ReturnType<typeof setTimeout>;
    let doneTimer: ReturnType<typeof setTimeout>;

    const scheduleExit = () => {
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - started));
      fadeTimer = setTimeout(() => {
        setExiting(true);
        doneTimer = setTimeout(onHidden, FADE_OUT_MS);
      }, wait);
    };

    scheduleExit();
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onHidden]);

  return (
    <div
      className={`app-welcome-splash${exiting ? ' app-welcome-splash--exit' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Загрузка Sortirovka24"
    >
      <div className="app-welcome-splash__orb app-welcome-splash__orb--a" aria-hidden />
      <div className="app-welcome-splash__orb app-welcome-splash__orb--b" aria-hidden />

      <div className="app-welcome-splash__content">
        <div className="app-welcome-splash__logo-wrap">
          <div className="app-welcome-splash__logo-glow" aria-hidden />
          <img
            src="/icon-192.png"
            alt=""
            width={96}
            height={96}
            className="app-welcome-splash__logo"
            decoding="async"
          />
        </div>

        <h1 className="app-welcome-splash__title">Сортировка 24</h1>
        <p className="app-welcome-splash__tagline">Ваш район — в одном приложении</p>

        <div className="app-welcome-splash__loader" aria-hidden>
          <span className="app-welcome-splash__bar" />
        </div>
        <p className="app-welcome-splash__hint">Загружаем сервисы…</p>
      </div>
    </div>
  );
}
