'use client';

// Super Admin → Paramètres → Général. Edits AppSettings via PATCH
// /api/admin/settings (SUPERADMIN-only). Currently a single field, but
// scoped as its own tab (not folded into Plans, which is pricing-specific)
// so future site-wide settings have a home. Styled like PlansTab.tsx:
// hardcoded slate/emerald, not the ZeFacto workspace theme tokens.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCache } from '@/lib/useApi';
import { LoadingState, ErrorState } from '@/components/ui/PageStates';

interface SettingsResponse {
  communityWhatsappUrl: string | null;
}

const SETTINGS_PATH = '/api/settings';
const cardClass = 'rounded-xl border border-border bg-canvas shadow-card';
const inputClass =
  'rounded-md border border-border bg-canvas px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-emerald-500/30 focus:outline-none disabled:opacity-50';

export function AdminGeneralTab({ canEdit }: { canEdit: boolean }) {
  const { data, loading, error, refresh } = useApi<SettingsResponse>(SETTINGS_PATH);
  const { toast } = useToast();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Syncs the draft input whenever fresh data lands (initial load, or after
  // a successful save's refresh()) — not a controlled round-trip on every
  // keystroke, so typing isn't fought by the fetch.
  useEffect(() => {
    if (data) setValue(data.communityWhatsappUrl ?? '');
  }, [data]);

  async function submit() {
    setSubmitting(true);
    try {
      await api('/api/admin/settings', {
        method: 'PATCH',
        body: { communityWhatsappUrl: value.trim() },
      });
      invalidateCache(SETTINGS_PATH);
      await refresh();
      toast('Paramètres mis à jour — appliqué partout instantanément.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;

  return (
    <div className={`${cardClass} flex flex-col gap-3 p-5`}>
      <div>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Communauté WhatsApp
        </h2>
        <p className="font-body text-sm text-muted-foreground">
          Lien affiché sur tous les boutons « Rejoindre la communauté » (page d&apos;accueil
          publique et bannière du tableau de bord) — mis à jour partout dès l&apos;enregistrement,
          sans redéploiement.
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-body text-xs font-medium text-muted-foreground">
          Lien d&apos;invitation WhatsApp
        </span>
        <input
          type="url"
          placeholder="https://chat.whatsapp.com/…"
          value={value}
          maxLength={300}
          onChange={(e) => setValue(e.target.value)}
          disabled={!canEdit}
          className={inputClass}
        />
      </label>
      {canEdit && (
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="self-start rounded-md bg-emerald-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
    </div>
  );
}
