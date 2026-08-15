'use client';

// Brand accent color override, layered the same way as ThemeContext: a
// `data-accent` attribute on <html>, CSS blocks in globals.css doing the
// actual token overrides, and a pre-paint boot script (layout.tsx) so a
// returning user with a custom accent doesn't see a green flash before
// hydration. 'green' is the shipped default and needs no override — it's
// simply the absence of the attribute.
//
// 'custom' is the escape hatch for "personnaliser à volonté": any hex the
// freelance picks via the native color input. It can't be pre-declared as a
// `data-accent` CSS block (unbounded values), so it's applied as inline
// custom properties instead — which still correctly wins over the
// attribute-selector blocks by normal CSS cascade rules, so both mechanisms
// coexist without one needing to know about the other.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { darkenHex } from '@/lib/color';

export type AccentColor = 'green' | 'blue' | 'violet' | 'orange' | 'rose' | 'slate' | 'custom';

export const ACCENT_PRESET_HEX: Record<Exclude<AccentColor, 'custom'>, string> = {
  green: '#059669',
  blue: '#2563eb',
  violet: '#7c3aed',
  orange: '#ea580c',
  rose: '#db2777',
  slate: '#334155',
};

interface AccentColorContextValue {
  accent: AccentColor;
  /** Resolved hex of whichever accent is active — preset or custom. */
  accentHex: string;
  setAccent: (accent: Exclude<AccentColor, 'custom'>) => void;
  setCustomAccent: (hex: string) => void;
}

const STORAGE_KEY = 'merrudit-accent';
const CUSTOM_STORAGE_KEY = 'merrudit-accent-custom';

const AccentColorContext = createContext<AccentColorContextValue>({
  accent: 'green',
  accentHex: ACCENT_PRESET_HEX.green,
  setAccent: () => {},
  setCustomAccent: () => {},
});

function isPreset(value: string | null): value is Exclude<AccentColor, 'custom'> {
  return (
    value === 'green' ||
    value === 'blue' ||
    value === 'violet' ||
    value === 'orange' ||
    value === 'rose' ||
    value === 'slate'
  );
}

function isHex(value: string | null): value is string {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

// Exported for ScopedColorGuard.tsx, which re-applies/clears the same DOM
// mutation on client-side route transitions (the pre-paint script in
// layout.tsx only covers the first full page load).
export function applyCustomAccent(hex: string): void {
  const root = document.documentElement.style;
  root.setProperty('--color-primary', hex);
  root.setProperty('--color-accent', darkenHex(hex, 0.12));
}

export function clearCustomAccent(): void {
  const root = document.documentElement.style;
  root.removeProperty('--color-primary');
  root.removeProperty('--color-accent');
}

export function AccentColorProvider({ children }: { children: ReactNode }) {
  // SSR always yields 'green' (no request-time signal); the inline
  // pre-paint script in layout.tsx has already set data-accent (or the
  // custom inline properties) on <html> by the time this mounts, so this
  // effect syncs React state to it.
  const [accent, setAccentState] = useState<AccentColor>('green');
  const [accentHex, setAccentHex] = useState(ACCENT_PRESET_HEX.green);

  useEffect(() => {
    try {
      const customHex = localStorage.getItem(CUSTOM_STORAGE_KEY);
      if (isHex(customHex)) {
        setAccentState('custom');
        setAccentHex(customHex);
        return;
      }
    } catch {
      // Storage unavailable — fall through to the preset attribute below.
    }
    const attr = document.documentElement.getAttribute('data-accent');
    const preset = isPreset(attr) ? attr : 'green';
    setAccentState(preset);
    setAccentHex(ACCENT_PRESET_HEX[preset]);
  }, []);

  function setAccent(next: Exclude<AccentColor, 'custom'>) {
    setAccentState(next);
    setAccentHex(ACCENT_PRESET_HEX[next]);
    clearCustomAccent();
    if (next === 'green') {
      document.documentElement.removeAttribute('data-accent');
    } else {
      document.documentElement.setAttribute('data-accent', next);
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.removeItem(CUSTOM_STORAGE_KEY);
    } catch {
      // Accent still applies for this session via the DOM attribute.
    }
  }

  function setCustomAccent(hex: string) {
    if (!isHex(hex)) return;
    setAccentState('custom');
    setAccentHex(hex);
    document.documentElement.removeAttribute('data-accent');
    applyCustomAccent(hex);
    try {
      localStorage.setItem(CUSTOM_STORAGE_KEY, hex);
    } catch {
      // Custom accent still applies for this session via the inline style.
    }
  }

  return (
    <AccentColorContext.Provider value={{ accent, accentHex, setAccent, setCustomAccent }}>
      {children}
    </AccentColorContext.Provider>
  );
}

export function useAccentColor(): AccentColorContextValue {
  return useContext(AccentColorContext);
}
