'use client';

// Purely cosmetic, opt-in preference for BottomNav's background treatment —
// 'off' (the original solid brand-green bar) is both the SSR default and
// the default value here, so unlike ThemeContext there is no light/dark
// flash to guard against with a pre-paint boot script: the nav simply
// renders in its default look until this mounts and (if the user opted
// into glass previously) upgrades on the client.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { syncUiPrefs } from '@/lib/syncUiPrefs';

export type BottomNavGlass = 'off' | 'transparent' | 'tinted';

interface BottomNavStyleContextValue {
  glass: BottomNavGlass;
  setGlass: (glass: BottomNavGlass) => void;
}

const STORAGE_KEY = 'merrudit-bottomnav-glass';

const BottomNavStyleContext = createContext<BottomNavStyleContextValue>({
  glass: 'off',
  setGlass: () => {},
});

function isGlass(value: string | null): value is BottomNavGlass {
  return value === 'off' || value === 'transparent' || value === 'tinted';
}

export function BottomNavStyleProvider({ children }: { children: ReactNode }) {
  const [glass, setGlassState] = useState<BottomNavGlass>('off');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isGlass(stored)) setGlassState(stored);
    } catch {
      // Storage unavailable — stays on the 'off' default for this session.
    }
  }, []);

  function setGlass(next: BottomNavGlass) {
    setGlassState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference still applies for this session, just won't persist.
    }
    syncUiPrefs({ bottomNavGlass: next });
  }

  return (
    <BottomNavStyleContext.Provider value={{ glass, setGlass }}>
      {children}
    </BottomNavStyleContext.Provider>
  );
}

export function useBottomNavStyle(): BottomNavStyleContextValue {
  return useContext(BottomNavStyleContext);
}
