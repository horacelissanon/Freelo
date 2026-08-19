'use client';

// Super Admin → Paramètres → Affichage. Deliberately much smaller than the
// freelance workspace's EspaceTab: only Thème (Clair/Sombre/Système) makes
// sense here. EspaceTab's other 4 controls (couleur du menu, couleur
// d'accent, forme du menu, navigation mobile) exist to let a freelancer
// personalize THEIR OWN brand identity — meaningless for an internal ops
// console with one fixed identity (slate/emerald) shared by every Super
// Admin, and there's no mobile bottom nav here to restyle either.
//
// Thème itself reuses the SAME global ThemeContext the freelance workspace
// uses (not a separate admin-scoped context) — dark/light is a genuine
// browser-level preference, not brand personalization, so sharing it is
// correct rather than a leak. The admin console's own hardcoded
// bg-canvas/text-foreground/border-border classes (see the other admin
// components) already carry real dark-mode values via that same
// [data-theme] mechanism — only the emerald "Super Admin" brand accent and
// the permanently-dark sidebar stay fixed regardless of this toggle.
import { useTheme, type ThemeMode } from '@/contexts/ThemeContext';

const THEME_MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'system', label: 'Système' },
];

const cardClass = 'rounded-xl border border-border bg-canvas shadow-card';

export function AdminAffichageTab() {
  const { mode, setMode } = useTheme();

  return (
    <div className={`flex flex-col gap-3 p-5 ${cardClass}`}>
      <div>
        <h2 className="font-headings text-base font-semibold text-foreground">Thème</h2>
        <p className="font-body text-sm text-muted-foreground">
          S&apos;applique à toute la console Super Admin (et à ton espace freelance si tu en as un
          sur ce même compte).
        </p>
      </div>
      <div className="flex flex-shrink-0 gap-1.5">
        {THEME_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            aria-pressed={mode === opt.value}
            className={`rounded-full border px-3 py-1.5 font-body text-xs font-medium ${
              mode === opt.value
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-border bg-canvas text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
