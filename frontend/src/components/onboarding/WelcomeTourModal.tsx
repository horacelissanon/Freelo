'use client';

// First-run welcome tour — explains the recommended Client -> Devis ->
// Projet -> Facture order (client-first is already enforced by every
// creation form's required clientId; this is purely explanatory, not a new
// gate), then collects the freelance's default currency + sector so new
// devis/projets pre-fill sensibly instead of always defaulting to XOF/
// 'Autre' (see resolveFreelanceSector's `fallback` param). Shown whenever
// `user.onboardingCompletedAt` is null: new signups, and existing accounts
// once the one-off backfill reset their flag back to null. Closing by any
// path (X, backdrop, or a button) marks it complete — one-way, mirrors
// PATCH /api/auth/me's own "finishes or skips" semantics; skipping before
// step 2 just leaves defaultCurrency/defaultSector unset.
import { useState } from 'react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import {
  CURRENCIES,
  FREELANCE_SECTOR_LABELS,
  FREELANCE_SECTOR_ICONS,
  type FreelanceSector,
} from '@/lib/constants';

const STEPS: { icon: string; title: string; description: string }[] = [
  {
    icon: 'users',
    title: '1. Ajoute ton client',
    description:
      'Toujours en premier — devis, projets et factures sont tous rattachés à un client.',
  },
  {
    icon: 'file-text',
    title: '2. Envoie un devis',
    description:
      'Ton client choisit une formule et valide en un clic — le prix est figé dès l’acceptation.',
  },
  {
    icon: 'folder-open',
    title: '3. Crée le projet',
    description:
      'Suis l’avancement étape par étape — ton client voit tout en temps réel sur son lien de suivi.',
  },
  {
    icon: 'receipt',
    title: '4. Facture à la livraison',
    description:
      'Ton moyen de paiement apparaît clairement — ton client règle directement, hors de l’app.',
  },
];

const SECTORS = Object.keys(FREELANCE_SECTOR_LABELS) as FreelanceSector[];

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

export function WelcomeTourModal({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [currency, setCurrency] = useState('XOF');
  const [sector, setSector] = useState<FreelanceSector | null>(null);
  const [saving, setSaving] = useState(false);

  async function finish(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: { ...body, onboardingCompleted: true } });
    } finally {
      onDone();
    }
  }

  function skip() {
    void finish({});
  }

  function confirmPreferences() {
    if (!sector) return;
    void finish({ defaultCurrency: currency, defaultSector: sector });
  }

  return (
    <Modal title="Bienvenue sur Zeloom" onClose={skip}>
      {step === 1 ? (
        <>
          <p className="mb-4 font-body text-sm text-muted-foreground">
            Pour une expérience fluide et un bon suivi de ton activité, suis cet ordre :
          </p>
          <div className="flex flex-col gap-3">
            {STEPS.map((s) => (
              <div
                key={s.title}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon i={s.icon} size={18} />
                </div>
                <div>
                  <p className="font-body text-sm font-semibold text-foreground">{s.title}</p>
                  <p className="mt-0.5 font-body text-xs text-muted-foreground">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 font-body text-xs text-muted-foreground">
            Tu peux créer le devis, le projet et la facture dans l’ordre qui t’arrange — seul le
            client doit exister en premier.
          </p>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="mt-5 w-full rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-primary-foreground"
          >
            Suivant
          </button>
        </>
      ) : (
        <>
          <p className="mb-4 font-body text-sm text-muted-foreground">
            Dernière étape : personnalise ton espace.
          </p>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Devise par défaut
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex flex-col gap-1.5 font-body text-sm text-foreground">
            Secteur freelance
            <div className="flex flex-wrap gap-2">
              {SECTORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSector(value)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    sector === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-canvas text-foreground'
                  }`}
                >
                  <Icon i={FREELANCE_SECTOR_ICONS[value]} size={13} />
                  {FREELANCE_SECTOR_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-4 font-body text-xs text-muted-foreground">
            Ce secteur sera pré-sélectionné sur tes prochains devis et projets — libre à toi d’en
            choisir un autre à chaque fois.
          </p>
          <button
            type="button"
            disabled={!sector || saving}
            onClick={confirmPreferences}
            className="mt-5 w-full rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            C’est parti
          </button>
        </>
      )}
    </Modal>
  );
}
