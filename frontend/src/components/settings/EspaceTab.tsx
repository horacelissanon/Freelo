'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBottomNavStyle, type BottomNavGlass } from '@/contexts/BottomNavStyleContext';
import { useAccentColor, ACCENT_PRESET_HEX, type AccentColor } from '@/contexts/AccentColorContext';
import { useSidebarColor, DEFAULT_SIDEBAR_COLOR } from '@/contexts/SidebarColorContext';
import { contrastRatio } from '@/lib/color';
import { Toggle } from '@/components/ui/Toggle';
import { Icon } from '@/components/ui/Icon';

type AccentPreset = Exclude<AccentColor, 'custom'>;

const ACCENT_LABELS: Record<AccentPreset, string> = {
  green: 'Vert',
  blue: 'Bleu',
  violet: 'Violet',
  orange: 'Orange',
  rose: 'Rose',
  slate: 'Ardoise',
};

const ACCENT_OPTIONS: { value: AccentPreset; label: string; hex: string }[] = (
  Object.keys(ACCENT_PRESET_HEX) as AccentPreset[]
).map((value) => ({ value, label: ACCENT_LABELS[value], hex: ACCENT_PRESET_HEX[value] }));

// Curated pairs (menu background + accent) so a freelance who doesn't want
// to fiddle with two separate pickers can apply a combo that's already
// known to work well in one click.
const COLOR_DUOS: { name: string; sidebar: string; accent: AccentPreset }[] = [
  { name: 'Forêt', sidebar: DEFAULT_SIDEBAR_COLOR, accent: 'green' },
  { name: 'Minuit', sidebar: '#0f172a', accent: 'blue' },
  { name: 'Aubergine', sidebar: '#2e1065', accent: 'violet' },
  { name: 'Ardoise', sidebar: '#18181b', accent: 'slate' },
  { name: 'Bordeaux', sidebar: '#450a0a', accent: 'rose' },
  { name: 'Ambre', sidebar: '#431407', accent: 'orange' },
];

// Purely indicative — never blocks the freelance's choice, just flags when
// the active-nav-item accent risks blending into the menu background.
const HARMONY_THRESHOLD = 2.2;

function DuoSwatch({ sidebar, accent }: { sidebar: string; accent: string }) {
  return (
    <span
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border/60"
      style={{ backgroundColor: sidebar }}
    >
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />
    </span>
  );
}

export function EspaceTab({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { glass, setGlass } = useBottomNavStyle();
  const glassVariant: Exclude<BottomNavGlass, 'off'> =
    glass === 'tinted' ? 'tinted' : 'transparent';
  const { accent, accentHex, setAccent, setCustomAccent } = useAccentColor();
  const { sidebarColor, setSidebarColor } = useSidebarColor();

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
        <h2 className="font-headings text-lg font-semibold text-foreground">Couleur du menu</h2>
        <p className="mt-1 mb-4 font-body text-xs text-muted-foreground">
          La couleur de fond du menu latéral (et du menu du bas sur mobile).
        </p>

        <p className="mb-2 font-body text-xs font-medium text-foreground">Combinaisons</p>
        <div className="flex flex-wrap gap-3">
          {COLOR_DUOS.map((duo) => {
            const isActive =
              sidebarColor.toLowerCase() === duo.sidebar.toLowerCase() && accent === duo.accent;
            return (
              <button
                key={duo.name}
                type="button"
                onClick={() => {
                  setSidebarColor(duo.sidebar);
                  setAccent(duo.accent);
                }}
                aria-pressed={isActive}
                title={duo.name}
                className={`flex flex-col items-center gap-1.5 rounded-lg p-1.5 ring-2 ring-offset-2 ring-offset-canvas transition-shadow ${
                  isActive ? 'ring-foreground' : 'ring-transparent'
                }`}
              >
                <DuoSwatch sidebar={duo.sidebar} accent={ACCENT_PRESET_HEX[duo.accent]} />
                <span className="font-body text-[11px] text-muted-foreground">{duo.name}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-5 mb-2 font-body text-xs font-medium text-foreground">
          Ou personnalise le fond à volonté
        </p>
        <div className="flex items-center gap-3">
          <label className="relative flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border">
            <input
              type="color"
              value={sidebarColor}
              onChange={(e) => setSidebarColor(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Choisir une couleur de fond personnalisée pour le menu"
            />
            <span
              className="h-7 w-7 rounded-full border border-border"
              style={{ backgroundColor: sidebarColor }}
            />
          </label>
          {sidebarColor.toLowerCase() !== DEFAULT_SIDEBAR_COLOR.toLowerCase() && (
            <button
              type="button"
              onClick={() => setSidebarColor(null)}
              className="font-body text-xs font-medium text-muted-foreground underline"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {contrastRatio(sidebarColor, accentHex) < HARMONY_THRESHOLD && (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-tag-orange px-3 py-2.5 font-body text-xs text-tag-orange-fg">
            <Icon i="info" size={14} className="mt-0.5 flex-shrink-0" />
            Le fond du menu et la couleur d&apos;accent se ressemblent beaucoup : les éléments
            actifs risquent de se fondre dans le menu. À titre indicatif seulement — ton choix reste
            appliqué.
          </p>
        )}
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
          <label
            className="relative flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border"
            title="Couleur personnalisée"
          >
            <input
              type="color"
              value={accentHex}
              onChange={(e) => setCustomAccent(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Choisir une couleur d'accent personnalisée"
            />
            {accent === 'custom' ? (
              <span
                className="h-7 w-7 rounded-full border border-border"
                style={{ backgroundColor: accentHex }}
              />
            ) : (
              <Icon i="palette" size={16} className="text-muted-foreground" />
            )}
          </label>
        </div>
      </section>
    </div>
  );
}
