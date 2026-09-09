import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

const STORAGE_KEY = 'anees_theme';

export type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  // No explicit choice yet -- follow the OS/browser preference for this first visit; from
  // here on the stored choice above always wins, even if the OS preference later changes.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Reads `theme` from the closure rather than using the setState(prev => ...) updater form
  // on purpose: React (in StrictMode/dev) can invoke that updater more than once per actual
  // commit, and this needs to stay a plain, non-idempotent-unsafe toggle, not a function with
  // side effects React might call an extra time.
  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
