'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBottomNavStyle, type BottomNavGlass } from '@/contexts/BottomNavStyleContext';
import { useAccentColor, type AccentColor } from '@/contexts/AccentColorContext';
import { Toggle } from '@/components/ui/Toggle';
import { Icon } from '@/components/ui/Icon';

const ACCENT_OPTIONS: { value: AccentColor; label: string; hex: string }[] = [
  { value: 'green', label: 'Vert', hex: '#059669' },
  { value: 'blue', label: 'Bleu', hex: '#2563eb' },
  { value: 'violet', label: 'Violet', hex: '#7c3aed' },
  { value: 'orange', label: 'Orange', hex: '#ea580c' },
  { value: 'rose', label: 'Rose', hex: '#db2777' },
  { value: 'slate', label: 'Ardoise', hex: '#334155' },
];

export function EspaceTab({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { glass, setGlass } = useBottomNavStyle();
  const glassVariant: Exclude<BottomNavGlass, 'off'> =
    glass === 'tinted' ? 'tinted' : 'transparent';
  const { accent, setAccent } = useAccentColor();

  const [togglePending, setTogglePending] = useState<
    'showPaidInvoicesDefault' | 'publicPortalEnabled' | null
  >(null);

  async function onToggle(key: 'showPaidInvoicesDefault' | 'publicPortalEnabled', next: boolean) {
    setTogglePending(key);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: { [key]: next } });
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
    } finally {
      setTogglePending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col divide-y divide-border rounded-lg border border-border bg-canvas p-5 shadow-card">
        <h2 className="mb-3 font-headings text-lg font-semibold text-foreground">Préférences</h2>
        <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
          <div className="flex min-w-0 flex-col">
            <span className="font-body text-sm font-medium text-foreground">Thème sombre</span>
            <span className="font-body text-xs text-muted-foreground">
              Suit les réglages de ton appareil par défaut ; ce bouton force une préférence.
            </span>
          </div>
          <Toggle
            checked={theme === 'dark'}
            onChange={(v) => setTheme(v ? 'dark' : 'light')}
            label="Thème sombre"
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 flex-col">
            <span className="font-body text-sm font-medium text-foreground">
              Afficher les factures payées
            </span>
            <span className="font-body text-xs text-muted-foreground">
              Inclut les documents payés dans la liste « Tous » de Devis &amp; Factures par défaut.
            </span>
          </div>
          <Toggle
            checked={user.showPaidInvoicesDefault}
            onChange={(v) => onToggle('showPaidInvoicesDefault', v)}
            disabled={togglePending === 'showPaidInvoicesDefault'}
            label="Afficher les factures payées"
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 flex-col">
            <span className="font-body text-sm font-medium text-foreground">
              Lien client public
            </span>
            <span className="font-body text-xs text-muted-foreground">
              Autorise tes clients à suivre l&apos;avancement de leurs projets via un lien de suivi.
            </span>
          </div>
          <Toggle
            checked={user.publicPortalEnabled}
            onChange={(v) => onToggle('publicPortalEnabled', v)}
            disabled={togglePending === 'publicPortalEnabled'}
            label="Lien client public"
          />
        </div>
        <div className="flex flex-col gap-3 py-4 last:pb-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col">
              <span className="font-body text-sm font-medium text-foreground">
                Menu liquid glass
              </span>
              <span className="font-body text-xs text-muted-foreground">
                Rend le menu du bas translucide et flouté, façon verre liquide, en gardant sa teinte
                verte. Désactivé, le menu actuel s&apos;applique — c&apos;est le réglage par défaut.
              </span>
            </div>
            <Toggle
              checked={glass !== 'off'}
              onChange={(v) => setGlass(v ? glassVariant : 'off')}
              label="Menu liquid glass"
            />
          </div>
          {glass !== 'off' && (
            <div className="flex gap-2 pl-0">
              {(['transparent', 'tinted'] as const).map((variant) => (
                <button
                  key={variant}
                  type="button"
                  onClick={() => setGlass(variant)}
                  className={`rounded-full border px-3 py-1.5 font-body text-xs font-medium ${
                    glass === variant
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-canvas text-foreground'
                  }`}
                >
                  {variant === 'transparent' ? 'Transparent' : 'Teinté'}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-canvas p-5 shadow-card">
        <h2 className="font-headings text-lg font-semibold text-foreground">
          Couleur d&apos;accent
        </h2>
        <p className="mt-1 mb-4 font-body text-xs text-muted-foreground">
          S&apos;applique aux boutons, liens et éléments actifs de tout l&apos;espace de travail.
        </p>
        <div className="flex flex-wrap gap-3">
          {ACCENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAccent(opt.value)}
              aria-label={opt.label}
              aria-pressed={accent === opt.value}
              className={`flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-canvas transition-shadow ${
                accent === opt.value ? 'ring-foreground' : 'ring-transparent'
              }`}
              style={{ backgroundColor: opt.hex }}
              title={opt.label}
            >
              {accent === opt.value && <Icon i="check-circle" size={16} className="text-white" />}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
