'use client';

// The freelancer's accent/sidebar color personalization is applied as
// inline CSS custom properties on <html> (see AccentColorContext /
// SidebarColorContext) so it can be free-form hex, not just a closed enum.
// <html> is shared across the whole origin and persists through Next.js
// client-side route transitions — so without this guard, a color picked in
// Paramètres → Espace stayed on <html> after navigating (client-side, no
// full reload) to the public landing page / login / signup / /suivi/[token]
// — pages that represent Freelo's own brand, not any one freelancer's.
//
// The root layout's pre-paint <Script> (ACCENT_INIT_SCRIPT / SIDEBAR_INIT_SCRIPT)
// only covers the FIRST full page load and is itself scoped to app routes;
// this component covers every subsequent client-side navigation by
// re-applying the stored personalization when entering the app, and
// resetting to the shipped defaults when leaving it.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { applyCustomAccent, clearCustomAccent } from '@/contexts/AccentColorContext';
import { applySidebarColor, clearSidebarColor } from '@/contexts/SidebarColorContext';
import { isAppRoute } from '@/lib/appRoutes';

const ACCENT_STORAGE_KEY = 'merrudit-accent';
const ACCENT_CUSTOM_STORAGE_KEY = 'merrudit-accent-custom';
const SIDEBAR_STORAGE_KEY = 'merrudit-sidebar-color';

function isHex(value: string | null): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function ScopedColorGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;

    if (!isAppRoute(pathname)) {
      root.removeAttribute('data-accent');
      clearCustomAccent();
      clearSidebarColor();
      return;
    }

    try {
      const customAccent = localStorage.getItem(ACCENT_CUSTOM_STORAGE_KEY);
      if (isHex(customAccent)) {
        applyCustomAccent(customAccent);
      } else {
        const preset = localStorage.getItem(ACCENT_STORAGE_KEY);
        if (preset && preset !== 'green') root.setAttribute('data-accent', preset);
        else root.removeAttribute('data-accent');
      }
    } catch {
      // Storage unavailable — defaults stand for this navigation.
    }

    try {
      const sidebarColor = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (isHex(sidebarColor)) applySidebarColor(sidebarColor);
    } catch {
      // Storage unavailable — default sidebar color stands.
    }
  }, [pathname]);

  return null;
}
