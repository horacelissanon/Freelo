'use client';

// Brand accent color override, layered the same way as ThemeContext: a
// `data-accent` attribute on <html>, CSS blocks in globals.css doing the
// actual token overrides, and a pre-paint boot script (layout.tsx) so a
// returning user with a custom accent doesn't see a green flash before
// hydration. 'green' is the shipped default and needs no override — it's
// simply the absence of the attribute.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type AccentColor = 'green' | 'blue' | 'violet' | 'orange' | 'rose' | 'slate';

interface AccentColorContextValue {
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
}

const STORAGE_KEY = 'merrudit-accent';

const AccentColorContext = createContext<AccentColorContextValue>({
  accent: 'green',
  setAccent: () => {},
});

function isAccent(value: string | null): value is AccentColor {
  return (
    value === 'green' ||
    value === 'blue' ||
    value === 'violet' ||
    value === 'orange' ||
    value === 'rose' ||
    value === 'slate'
  );
}

function resolveDomAccent(): AccentColor {
  if (typeof document === 'undefined') return 'green';
  const attr = document.documentElement.getAttribute('data-accent');
  return isAccent(attr) ? attr : 'green';
}

export function AccentColorProvider({ children }: { children: ReactNode }) {
  // SSR always yields 'green' (no request-time signal); the inline
  // pre-paint script in layout.tsx has already set data-accent on <html>
  // by the time this mounts, so this effect syncs React state to it.
  const [accent, setAccentState] = useState<AccentColor>('green');

  useEffect(() => {
    setAccentState(resolveDomAccent());
  }, []);

  function setAccent(next: AccentColor) {
    setAccentState(next);
    if (next === 'green') {
      document.documentElement.removeAttribute('data-accent');
    } else {
      document.documentElement.setAttribute('data-accent', next);
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — accent still applies for this session via the DOM attribute.
    }
  }

  return (
    <AccentColorContext.Provider value={{ accent, setAccent }}>
      {children}
    </AccentColorContext.Provider>
  );
}

export function useAccentColor(): AccentColorContextValue {
  return useContext(AccentColorContext);
}
