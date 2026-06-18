import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getCurrentUserTheme, onAuthChanged, setCurrentUserTheme } from '@/lib/localAuth';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'sortirovka-theme';

export function ThemeProvider({
  children,
  forcedTheme,
}: {
  children: ReactNode;
  /** When set, always use this theme (admin panel uses light). */
  forcedTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (forcedTheme) return forcedTheme;
    try {
      const userTheme = getCurrentUserTheme();
      if (userTheme === 'dark' || userTheme === 'light') return userTheme;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) return 'dark';
    } catch {
      // localStorage or matchMedia not available
    }
    return 'light';
  });

  // Apply theme class to <html>
  useEffect(() => {
    try {
      const active = forcedTheme ?? theme;
      const root = document.documentElement;
      root.classList.remove('dark', 'light');
      root.classList.add(active);
      if (!forcedTheme) {
        localStorage.setItem(STORAGE_KEY, active);
      }
    } catch {
      // Ignore DOM/localStorage errors
    }
  }, [theme, forcedTheme]);

  // Keep theme in sync with auth profile changes.
  useEffect(() => {
    if (forcedTheme) return;
    return onAuthChanged(() => {
      const userTheme = getCurrentUserTheme();
      if (!userTheme) return;
      setThemeState((prev) => (prev === userTheme ? prev : userTheme));
    });
  }, [forcedTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    if (forcedTheme) return;
    setThemeState(newTheme);
    setCurrentUserTheme(newTheme);
  }, [forcedTheme]);

  const toggleTheme = useCallback(() => {
    if (forcedTheme) return;
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      setCurrentUserTheme(next);
      return next;
    });
  }, [forcedTheme]);

  const activeTheme = forcedTheme ?? theme;

  return (
    <ThemeContext.Provider value={{ theme: activeTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}