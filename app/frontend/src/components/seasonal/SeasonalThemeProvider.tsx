/** Global switch for the New Year look: puts `ny` on <html> while the theme is on and tells the decor what to draw. */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  SEASONAL_DEFAULTS, SeasonalSettings, cachedSettings, fetchSettings, inWindow, readPreview, readStill, writeStill,
} from '@/lib/seasonal';
import '@fontsource/lobster/cyrillic-400.css';
import '@fontsource/lobster/cyrillic-ext-400.css';
import '@/styles/seasonal.css';

interface SeasonalState {
  active: boolean;
  settings: SeasonalSettings;
  /** The viewer stopped the snow and twinkling (or the system asks for reduced motion). */
  still: boolean;
  userStill: boolean;
  setUserStill: (still: boolean) => void;
  apply: (settings: SeasonalSettings) => void;
}

const SeasonalContext = createContext<SeasonalState>({
  active: false,
  settings: SEASONAL_DEFAULTS,
  still: true,
  userStill: false,
  setUserStill: () => undefined,
  apply: () => undefined,
});

function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = globalThis.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

export function SeasonalThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SeasonalSettings>(() => cachedSettings() || SEASONAL_DEFAULTS);
  const [loaded, setLoaded] = useState(() => cachedSettings() !== null);
  const [preview] = useState(readPreview);
  const [userStill, setStill] = useState(readStill);
  const reduced = useReducedMotion();

  useEffect(() => {
    let alive = true;
    fetchSettings().then((s) => { if (alive) { setSettings(s); setLoaded(true); } }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const active = preview ?? (loaded && inWindow(settings));
  const still = reduced || userStill;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('ny', active);
    root.classList.toggle('ny-still', active && still);
    return () => root.classList.remove('ny', 'ny-still');
  }, [active, still]);

  const setUserStill = useCallback((value: boolean) => { writeStill(value); setStill(value); }, []);

  const value = useMemo<SeasonalState>(
    () => ({ active, settings, still, userStill, setUserStill, apply: setSettings }),
    [active, settings, still, userStill, setUserStill],
  );
  return <SeasonalContext.Provider value={value}>{children}</SeasonalContext.Provider>;
}

export function useSeasonal(): SeasonalState {
  return useContext(SeasonalContext);
}
