'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { ContentBlockList, type ContentBlockDraft } from '@/components/forms/ContentBlockList';

interface PaymentMethodRow {
  id: string;
  primaryText: string;
  secondaryText: string | null;
}

// Own independent save action (PUT /api/settings/payment-methods), kept
// separate from CompteTab's single dirty-save-bar flow (PATCH /api/auth/me)
// since it's a structurally different resource — same pattern as "Photo de
// profil" and "Zone dangereuse" already being their own sections there.
export function DefaultPaymentMethodsSection() {
  const { data, loading } = useApi<{ methods: PaymentMethodRow[] }>(
    '/api/settings/payment-methods',
  );
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<ContentBlockDraft[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !initialized) {
      setBlocks(
        data.methods.map((m) => ({
          primaryText: m.primaryText,
          secondaryText: m.secondaryText ?? '',
        })),
      );
      setInitialized(true);
    }
  }, [data, initialized]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const methods = blocks
        .map((b) => ({ primaryText: b.primaryText.trim(), secondaryText: b.secondaryText.trim() }))
        .filter((b) => b.primaryText.length > 0)
        .map(({ primaryText, secondaryText }) => ({
          primaryText,
          ...(secondaryText ? { secondaryText } : {}),
        }));
      await api('/api/settings/payment-methods', { method: 'PUT', body: { methods } });
      toast('Moyens de paiement enregistrés.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-headings text-lg font-semibold text-foreground">
          Moyens de paiement par défaut
        </h2>
        <p className="font-body text-xs text-muted-foreground">
          Affichés à titre indicatif à tes clients (nouveaux devis, suivi de projet) tant
          qu&rsquo;aucune information plus précise n&rsquo;est renseignée pour ce document.
        </p>
      </div>
      <ContentBlockList
        title="Tes moyens de paiement"
        icon="credit-card"
        primaryPlaceholder="Ex. MTN Mobile Money, Moov Money"
        secondaryPlaceholder="Ex. 01 97 00 00 00"
        addLabel="Ajouter un moyen de paiement"
        blocks={blocks}
        onChange={setBlocks}
      />
      {error && (
        <p role="alert" className="font-body text-sm text-tag-red-fg">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="self-end rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? 'Enregistrement…' : 'Enregistrer les moyens de paiement'}
      </button>
    </div>
  );
}
