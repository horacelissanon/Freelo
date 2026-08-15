'use client';

// Sidebar/BottomNav background color override. Unlike AccentColorContext's
// 6 fixed presets (a small closed enum applied via `data-accent` + static
// CSS blocks), this is free-form ("personnaliser à volonté") — any hex the
// freelance picks — so it's applied via inline CSS custom properties on
// <html> instead: no way to pre-declare a CSS block per arbitrary hex.
// `--color-sidebar-foreground` is re-derived from the chosen background on
// every change (readableForeground) so nav text/icons stay legible no
// matter how light or dark the pick is — that's an implementation detail,
// not a limit on the color choice itself.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { mixHex, readableForeground } from '@/lib/color';

const STORAGE_KEY = 'merrudit-sidebar-color';
// Matches --color-sidebar's shipped default in globals.css.
export const DEFAULT_SIDEBAR_COLOR = '#0b2a1c';

interface SidebarColorContextValue {
  sidebarColor: string;
  setSidebarColor: (hex: string | null) => void;
}

const SidebarColorContext = createContext<SidebarColorContextValue>({
  sidebarColor: DEFAULT_SIDEBAR_COLOR,
  setSidebarColor: () => {},
});

function isHex(value: string | null): value is string {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

export function applySidebarColor(hex: string): void {
  const root = document.documentElement.style;
  root.setProperty('--color-sidebar', hex);
  const fg = readableForeground(hex);
  root.setProperty('--color-sidebar-foreground', fg);
  root.setProperty('--color-sidebar-muted', mixHex(hex, fg, 0.14));
}

function clearSidebarColor(): void {
  const root = document.documentElement.style;
  root.removeProperty('--color-sidebar');
  root.removeProperty('--color-sidebar-foreground');
  root.removeProperty('--color-sidebar-muted');
}

export function SidebarColorProvider({ children }: { children: ReactNode }) {
  // SSR always yields the default (no request-time signal) — the inline
  // pre-paint script in layout.tsx has already applied a stored custom
  // color by the time this mounts, so this effect only syncs React state.
  const [sidebarColor, setSidebarColorState] = useState(DEFAULT_SIDEBAR_COLOR);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isHex(stored)) setSidebarColorState(stored);
    } catch {
      // Storage unavailable — default stands.
    }
  }, []);

  function setSidebarColor(next: string | null) {
    if (next && isHex(next)) {
      setSidebarColorState(next);
      applySidebarColor(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Custom color still applies for this session via the DOM style.
      }
    } else {
      setSidebarColorState(DEFAULT_SIDEBAR_COLOR);
      clearSidebarColor();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // No-op — nothing to clean up if storage was never writable.
      }
    }
  }

  return (
    <SidebarColorContext.Provider value={{ sidebarColor, setSidebarColor }}>
      {children}
    </SidebarColorContext.Provider>
  );
}

export function useSidebarColor(): SidebarColorContextValue {
  return useContext(SidebarColorContext);
}
