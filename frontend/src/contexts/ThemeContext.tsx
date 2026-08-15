'use client';

// Explicit light/dark override, layered on top of the CSS `prefers-color-scheme`
// default (see globals.css). 'system' is a real, persisted choice — not just
// "nothing selected yet" — meaning the freelance explicitly wants to follow
// the OS setting, including live changes while the app stays open (the CSS
// media query already does this for free; the matchMedia listener below only
// keeps the JS-exposed `theme` value in sync for anything that reads it
// reactively instead of relying on CSS alone). Mirrors ToastContext's
// default-value (not null-checked) pattern rather than AuthContext's
// throw-if-null one — a missing provider should degrade gracefully, not
// crash the tree.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  /** The theme actually applied right now — resolves 'system' to whatever
   *  the OS currently prefers. */
  theme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'merrudit-theme';

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  theme: 'light',
  setMode: () => {},
});

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Resolves the mode to what's actually rendered: for 'light'/'dark' that's
// just the mode itself, but for 'system' it must read the OS preference
// directly, NOT the data-theme attribute — the pre-paint script deliberately
// leaves that attribute unset in system mode (see layout.tsx) so the CSS
// `prefers-color-scheme` media query drives colors on its own, which means
// the attribute alone can't tell us whether the page is currently rendering
// light or dark.
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR always yields 'system'/'light' (no request-time signal); the inline
  // pre-paint script in layout.tsx has already applied (or deliberately left
  // unset) data-theme on <html> by the time this mounts, so this effect
  // syncs React state to the real stored preference rather than re-deciding
  // anything the script already decided.
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [theme, setThemeState] = useState<ResolvedTheme>('light');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage unavailable — stays on the 'system' default for this session.
    }
    const initialMode = isThemeMode(stored) ? stored : 'system';
    setModeState(initialMode);
    setThemeState(resolveTheme(initialMode));
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    function onChange() {
      setThemeState(mql.matches ? 'dark' : 'light');
    }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    if (next === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', next);
    }
    setThemeState(resolveTheme(next));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — mode still applies for this session, just
      // won't persist across reloads.
    }
  }

  return <ThemeContext.Provider value={{ mode, theme, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
