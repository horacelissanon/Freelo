'use client';

// Purely cosmetic, opt-in preference for how primary navigation is reached
// on mobile — 'bottom' (the shipped default) is the floating nav bar docked
// to the bottom of the screen; 'drawer' replaces it with a hamburger button
// in the mobile top bar that slides the same Sidebar content in from the
// left instead. Like SidebarShapeContext/BottomNavStyleContext, 'bottom' is
// both the SSR default and the default value here, so there is no flash to
// guard against with a pre-paint boot script: mobile nav renders as the
// bottom bar until this mounts and (if the freelance opted into 'drawer'
// previously) upgrades on the client.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { syncUiPrefs } from '@/lib/syncUiPrefs';

export type MobileNavStyle = 'bottom' | 'drawer';

interface MobileNavStyleContextValue {
  navStyle: MobileNavStyle;
  setNavStyle: (style: MobileNavStyle) => void;
}

const STORAGE_KEY = 'merrudit-mobile-nav-style';

const MobileNavStyleContext = createContext<MobileNavStyleContextValue>({
  navStyle: 'bottom',
  setNavStyle: () => {},
});

function isNavStyle(value: string | null): value is MobileNavStyle {
  return value === 'bottom' || value === 'drawer';
}

export function MobileNavStyleProvider({ children }: { children: ReactNode }) {
  const [navStyle, setNavStyleState] = useState<MobileNavStyle>('bottom');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isNavStyle(stored)) setNavStyleState(stored);
    } catch {
      // Storage unavailable — stays on the 'bottom' default for this session.
    }
  }, []);

  function setNavStyle(next: MobileNavStyle) {
    setNavStyleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference still applies for this session, just won't persist.
    }
    syncUiPrefs({ mobileNavStyle: next });
  }

  return (
    <MobileNavStyleContext.Provider value={{ navStyle, setNavStyle }}>
      {children}
    </MobileNavStyleContext.Provider>
  );
}

export function useMobileNavStyle(): MobileNavStyleContextValue {
  return useContext(MobileNavStyleContext);
}
