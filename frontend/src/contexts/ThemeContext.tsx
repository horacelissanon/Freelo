'use client';

// Explicit light/dark override, layered on top of the CSS `prefers-color-scheme`
// default (see globals.css). Mirrors ToastContext's default-value (not
// null-checked) pattern rather than AuthContext's throw-if-null one — a
// missing provider should degrade to 'light', not crash the tree.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'merrudit-theme';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
});

function resolveDomTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR always yields 'light' (no request-time signal); the inline
  // pre-paint script in layout.tsx has already set data-theme on <html>
  // by the time this mounts, so this effect syncs React state to it.
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    setThemeState(resolveDomTheme());
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private browsing, quota) — theme still applies
      // for this session via the DOM attribute, just won't persist.
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
