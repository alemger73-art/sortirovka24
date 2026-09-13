import { Capacitor } from '@capacitor/core';
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
  /** When set, always use this theme (for embedded previews). */
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
      root.style.colorScheme = active;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', active === 'dark' ? '#0e1520' : '#ffffff');
      if (!forcedTheme) {
        localStorage.setItem(STORAGE_KEY, active);
      }
    } catch {
      // Ignore DOM/localStorage errors
    }
  }, [theme, forcedTheme]);

  // Match the phone status bar to the selected app theme as well.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      if (cancelled) return;
      return StatusBar.setStyle({ style: (forcedTheme ?? theme) === 'dark' ? Style.Dark : Style.Light });
    }).catch(() => undefined);
    return () => { cancelled = true; };
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
    try { setCurrentUserTheme(newTheme); } catch { /* Apply for this session when storage is unavailable. */ }
  }, [forcedTheme]);

  const toggleTheme = useCallback(() => {
    if (forcedTheme) return;
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { setCurrentUserTheme(next); } catch { /* Apply for this session when storage is unavailable. */ }
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