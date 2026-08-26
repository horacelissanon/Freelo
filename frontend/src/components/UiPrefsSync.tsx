'use client';

// Pulls the Paramètres → Espace de travail personalization (theme, accent,
// sidebar color/shape, mobile nav style, bottom nav glass) from
// /api/settings/ui-prefs once a session is known, and applies it to the 6
// local contexts whenever it differs from what's already on this device —
// this is what makes a choice made on one device actually reach another.
// Values are trusted as-is: they were already Zod-validated server-side on
// the way in (PATCH /api/settings/ui-prefs), so there's no second
// boundary to re-validate here.
//
// Placed next to ScopedColorGuard in layout.tsx (same reasoning: needs to be
// inside AuthProvider for useAuth(), and inside all 6 preference providers,
// which already wrap AuthProvider in the tree).
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { useTheme } from '@/contexts/ThemeContext';
import { useAccentColor } from '@/contexts/AccentColorContext';
import { useSidebarColor } from '@/contexts/SidebarColorContext';
import { useSidebarShape } from '@/contexts/SidebarShapeContext';
import { useMobileNavStyle } from '@/contexts/MobileNavStyleContext';
import { useBottomNavStyle } from '@/contexts/BottomNavStyleContext';

interface UiPrefs {
  theme?: 'light' | 'dark' | 'system';
  accent?: 'green' | 'blue' | 'violet' | 'orange' | 'rose' | 'slate' | 'custom';
  accentCustomHex?: string;
  sidebarColor?: string | null;
  sidebarShape?: 'classic' | 'capsule' | 'dock';
  mobileNavStyle?: 'bottom' | 'drawer';
  bottomNavGlass?: 'off' | 'transparent' | 'tinted';
}

export function UiPrefsSync() {
  const { user } = useAuth();
  const { data } = useApi<{ prefs: UiPrefs }>('/api/settings/ui-prefs', { skip: !user });

  const { mode: theme, setMode: setTheme } = useTheme();
  const { accent, accentHex, setAccent, setCustomAccent } = useAccentColor();
  const { sidebarColor, setSidebarColor } = useSidebarColor();
  const { shape: sidebarShape, setShape: setSidebarShape } = useSidebarShape();
  const { navStyle: mobileNavStyle, setNavStyle: setMobileNavStyle } = useMobileNavStyle();
  const { glass: bottomNavGlass, setGlass: setBottomNavGlass } = useBottomNavStyle();

  useEffect(() => {
    const prefs = data?.prefs;
    if (!prefs) return;

    if (prefs.theme && prefs.theme !== theme) setTheme(prefs.theme);

    if (prefs.accent === 'custom') {
      if (prefs.accentCustomHex && (accent !== 'custom' || accentHex !== prefs.accentCustomHex)) {
        setCustomAccent(prefs.accentCustomHex);
      }
    } else if (prefs.accent && prefs.accent !== accent) {
      setAccent(prefs.accent);
    }

    if (prefs.sidebarColor !== undefined && prefs.sidebarColor !== sidebarColor) {
      setSidebarColor(prefs.sidebarColor);
    }

    if (prefs.sidebarShape && prefs.sidebarShape !== sidebarShape) {
      setSidebarShape(prefs.sidebarShape);
    }

    if (prefs.mobileNavStyle && prefs.mobileNavStyle !== mobileNavStyle) {
      setMobileNavStyle(prefs.mobileNavStyle);
    }

    if (prefs.bottomNavGlass && prefs.bottomNavGlass !== bottomNavGlass) {
      setBottomNavGlass(prefs.bottomNavGlass);
    }
    // Only re-run when a fresh server payload arrives — the setter calls
    // above intentionally change several of the dependency values, which
    // would otherwise retrigger this effect in a loop.
  }, [data]);

  return null;
}
