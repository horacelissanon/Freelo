'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Toggle } from '@/components/ui/Toggle';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

const CURRENCIES: { value: string; label: string }[] = [
  { value: 'XOF', label: 'XOF — Franc CFA (UEMOA)' },
  { value: 'XAF', label: 'XAF — Franc CFA (CEMAC)' },
  { value: 'MAD', label: 'MAD — Dirham marocain' },
  { value: 'GNF', label: 'GNF — Franc guinéen' },
  { value: 'GHS', label: 'GHS — Cedi ghanéen' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — Dollar américain' },
];

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

export function EspaceTab({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [studioName, setStudioName] = useState(user.studioName ?? '');
  const [taxId, setTaxId] = useState(user.taxId ?? '');
  const [address, setAddress] = useState(user.address ?? '');
  const [defaultCurrency, setDefaultCurrency] = useState(user.defaultCurrency);
  const [language, setLanguage] = useState(user.language);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglePending, setTogglePending] = useState<
    'showPaidInvoicesDefault' | 'publicPortalEnabled' | null
  >(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: {
          studioName: studioName.trim(),
          taxId: taxId.trim(),
          address: address.trim(),
          defaultCurrency,
          language,
        },
      });
      await refresh();
      toast('Espace de travail mis à jour.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

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
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-lg border border-border bg-canvas p-5 shadow-card"
      >
        <h2 className="font-headings text-lg font-semibold text-foreground">Studio</h2>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Nom du studio
          <input
            type="text"
            value={studioName}
            onChange={(e) => setStudioName(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Numéro fiscal / NIF
          <input
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            maxLength={60}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Adresse
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={300}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Devise par défaut
            <select
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Langue
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={inputClass}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="font-body text-sm text-tag-red-fg">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mt-1 w-fit rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      <section className="flex flex-col divide-y divide-border rounded-lg border border-border bg-canvas p-5 shadow-card">
        <h2 className="mb-3 font-headings text-lg font-semibold text-foreground">Préférences</h2>
        <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
          <div className="flex flex-col">
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
          <div className="flex flex-col">
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
        <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
          <div className="flex flex-col">
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
      </section>
    </div>
  );
}
