'use client';

// Purely cosmetic, opt-in preference for the desktop sidebar's silhouette —
// 'capsule' (the full-width floating pill) is both the SSR default and the
// default value here, so like BottomNavStyleContext's 'off' default there is
// no flash to guard against with a pre-paint boot script: the sidebar simply
// renders in its default shape until this mounts and (if the user opted
// into 'classic' or 'dock' previously) switches on the client.
// The same choice also drives BottomNav's shape on mobile (see BottomNav.tsx)
// so the two surfaces read as one consistent pick across breakpoints.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { syncUiPrefs } from '@/lib/syncUiPrefs';

export type SidebarShape = 'classic' | 'capsule' | 'dock';

interface SidebarShapeContextValue {
  shape: SidebarShape;
  setShape: (shape: SidebarShape) => void;
}

const STORAGE_KEY = 'merrudit-sidebar-shape';

const SidebarShapeContext = createContext<SidebarShapeContextValue>({
  shape: 'capsule',
  setShape: () => {},
});

function isShape(value: string | null): value is SidebarShape {
  return value === 'classic' || value === 'capsule' || value === 'dock';
}

export function SidebarShapeProvider({ children }: { children: ReactNode }) {
  const [shape, setShapeState] = useState<SidebarShape>('capsule');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isShape(stored)) setShapeState(stored);
    } catch {
      // Storage unavailable — stays on the 'capsule' default for this session.
    }
  }, []);

  function setShape(next: SidebarShape) {
    setShapeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference still applies for this session, just won't persist.
    }
    syncUiPrefs({ sidebarShape: next });
  }

  return (
    <SidebarShapeContext.Provider value={{ shape, setShape }}>
      {children}
    </SidebarShapeContext.Provider>
  );
}

export function useSidebarShape(): SidebarShapeContextValue {
  return useContext(SidebarShapeContext);
}
