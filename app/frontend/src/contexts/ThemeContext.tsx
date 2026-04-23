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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
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

  // Apply theme class + attribute to <html>
  useEffect(() => {
    try {
      const root = document.documentElement;
      root.setAttribute('data-theme', theme);
      if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore DOM/localStorage errors
    }
  }, [theme]);

  // Keep theme in sync with auth profile changes.
  useEffect(() => {
    return onAuthChanged(() => {
      const userTheme = getCurrentUserTheme();
      if (!userTheme) return;
      setThemeState((prev) => (prev === userTheme ? prev : userTheme));
    });
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    setCurrentUserTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      setCurrentUserTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}