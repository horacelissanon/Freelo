'use client';

// Small icon button cycling light → dark → system, sharing the same
// ThemeContext/localStorage key ('merrudit-theme') as the Paramètres →
// Espace 3-way selector — pick a theme here on the public landing page and
// it's still applied once the visitor signs in and reaches the workspace.
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useTheme, type ThemeMode } from '@/contexts/ThemeContext';

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const MODE_ICON: Record<ThemeMode, string> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
};

const MODE_LABEL: Record<ThemeMode, string> = {
  light: 'Thème clair',
  dark: 'Thème sombre',
  system: 'Thème automatique (système)',
};

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoids a hydration mismatch: SSR always renders the 'system'/'light'
  // default icon, so this only shows the real stored preference once
  // mounted client-side, same guard pattern InstallPromptWidget uses.
  useEffect(() => setMounted(true), []);

  return (
    <button
      type="button"
      onClick={() => setMode(NEXT_MODE[mode])}
      aria-label={`${MODE_LABEL[mode]} — cliquer pour changer`}
      title={MODE_LABEL[mode]}
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground ${className}`}
    >
      <Icon i={mounted ? MODE_ICON[mode] : 'monitor'} size={16} />
    </button>
  );
}
