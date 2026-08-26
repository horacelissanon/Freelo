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
import { usePathname } from 'next/navigation';
import { mixHex, readableForeground } from '@/lib/color';
import { useTheme } from '@/contexts/ThemeContext';
import { isAppRoute } from '@/lib/appRoutes';
import { syncUiPrefs } from '@/lib/syncUiPrefs';

const STORAGE_KEY = 'merrudit-sidebar-color';
// Matches --color-sidebar's shipped default in globals.css.
export const DEFAULT_SIDEBAR_COLOR = '#0b2a1c';

// EspaceTab.tsx's "Sobre & clair" preset — exported so both the picker UI
// and the dark-mode substitution below read from one source of truth.
export const LIGHT_SIDEBAR_HEX = '#f8fafc';
// Stand-in for LIGHT_SIDEBAR_HEX when dark mode is active — a freelance who
// picked the white preset for its sober, professional look didn't ask for a
// blinding white bar next to a dark workspace. Reuses the "Ardoise" duo's
// sidebar shade (EspaceTab.tsx's COLOR_DUOS) instead of inventing a new hex.
// Deliberately narrow: every other sidebar color (including other light
// ones the freelance picks via the custom hex input) stays exactly as
// picked, in both themes — this fixes one shipped preset reading "too
// white" in dark mode, it's not a general theme-follows-sidebar behavior.
const LIGHT_SIDEBAR_DARK_SUBSTITUTE = '#18181b';

interface SidebarColorContextValue {
  sidebarColor: string;
  /** sidebarColor with the dark-mode LIGHT_SIDEBAR_HEX substitution already
   *  applied — what's actually painted right now. Rendering decisions that
   *  key off how light/dark the sidebar reads (e.g. Sidebar.tsx's `sober`
   *  pill styling) should use this, not the raw stored pick. */
  effectiveSidebarColor: string;
  setSidebarColor: (hex: string | null) => void;
}

const SidebarColorContext = createContext<SidebarColorContextValue>({
  sidebarColor: DEFAULT_SIDEBAR_COLOR,
  effectiveSidebarColor: DEFAULT_SIDEBAR_COLOR,
  setSidebarColor: () => {},
});

function isHex(value: string | null): value is string {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

function isDarkModeActive(): boolean {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Pure by design (isDarkModeActive's DOM/matchMedia read stays separate) so
// it's trivially testable and mirrors 1:1 the raw-JS copy in the root
// layout.tsx pre-paint script (which can't import this module).
export function resolveSidebarColorForTheme(hex: string, isDark: boolean): string {
  return isDark && hex.toLowerCase() === LIGHT_SIDEBAR_HEX ? LIGHT_SIDEBAR_DARK_SUBSTITUTE : hex;
}

export function applySidebarColor(hex: string): void {
  const effective = resolveSidebarColorForTheme(hex, isDarkModeActive());
  const root = document.documentElement.style;
  root.setProperty('--color-sidebar', effective);
  const fg = readableForeground(effective);
  root.setProperty('--color-sidebar-foreground', fg);
  root.setProperty('--color-sidebar-muted', mixHex(effective, fg, 0.14));
}

// Exported for ScopedColorGuard.tsx — see applyCustomAccent's comment above
// for why this needs to be re-invokable outside the setter.
export function clearSidebarColor(): void {
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
  const { theme } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isHex(stored)) setSidebarColorState(stored);
    } catch {
      // Storage unavailable — default stands.
    }
  }, []);

  // Re-applies whenever the resolved theme flips (toggle, or a live OS
  // change under 'system' mode) so the "Sobre & clair" white preset swaps to
  // its dark substitute without needing a navigation/reload. Redundant with
  // setSidebarColor's own applySidebarColor call right after a pick (fires
  // there too, since sidebarColor just changed) — harmless, just the
  // simplest way to also cover the theme-only-changed case.
  //
  // Gated to app routes: this provider wraps the whole app (public pages
  // included), so without the isAppRoute check this effect — which fires on
  // every mount, not just on an explicit color pick — reapplies the stored
  // custom color AFTER ScopedColorGuard's route-based clearSidebarColor()
  // (child effects run before parent effects; ScopedColorGuard is nested
  // inside this provider), silently undoing the guard and leaking a
  // freelancer's personal sidebar color onto /login, /signup, the landing
  // page, etc.
  useEffect(() => {
    if (!isAppRoute(pathname ?? '')) return;
    applySidebarColor(sidebarColor);
  }, [sidebarColor, theme, pathname]);

  function setSidebarColor(next: string | null) {
    if (next && isHex(next)) {
      setSidebarColorState(next);
      applySidebarColor(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Custom color still applies for this session via the DOM style.
      }
      syncUiPrefs({ sidebarColor: next });
    } else {
      setSidebarColorState(DEFAULT_SIDEBAR_COLOR);
      clearSidebarColor();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // No-op — nothing to clean up if storage was never writable.
      }
      syncUiPrefs({ sidebarColor: null });
    }
  }

  const effectiveSidebarColor = resolveSidebarColorForTheme(sidebarColor, theme === 'dark');

  return (
    <SidebarColorContext.Provider value={{ sidebarColor, effectiveSidebarColor, setSidebarColor }}>
      {children}
    </SidebarColorContext.Provider>
  );
}

export function useSidebarColor(): SidebarColorContextValue {
  return useContext(SidebarColorContext);
}
