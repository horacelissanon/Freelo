'use client';

// Super Admin → Plans. Edits PlanConfig via PATCH /api/admin/plans/[plan]
// (SUPERADMIN-only — real-money change). Every consumer (checkout, landing
// page, Paramètres → Abonnement, admin Abonnements/Facturation, gating
// routes) reads through the same lib/server/billing/plans.ts accessor, so a
// save here takes effect everywhere at once. Styled like SubscriptionsTab.tsx:
// hardcoded slate/emerald, not the Freelo workspace theme tokens.
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCache } from '@/lib/useApi';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { LoadingState, ErrorState } from '@/components/ui/PageStates';
import { formatPrice } from '@/lib/utils';

type Plan = 'FREE' | 'PRO';

interface PlanConfig {
  plan: Plan;
  monthlyAmount: number | null;
  yearlyAmount: number | null;
  currency: string;
  maxClients: number | null;
  maxActiveProjects: number | null;
  features: string[];
}

interface PlansResponse {
  free: PlanConfig;
  pro: PlanConfig;
}

const PLANS_PATH = '/api/admin/plans';
const cardClass = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';

// Local editable copy of a plan's features array — plain text inputs with
// add/remove, no reordering. Kept generic so both cards share one editor.
function FeatureListEditor({
  features,
  onChange,
}: {
  features: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-body text-xs font-medium text-slate-500">Fonctionnalités</span>
      {features.map((feature, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={feature}
            maxLength={200}
            onChange={(e) => {
              const next = [...features];
              next[i] = e.target.value;
              onChange(next);
            }}
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            aria-label="Supprimer cette fonctionnalité"
            onClick={() => onChange(features.filter((_, idx) => idx !== i))}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-red-600"
          >
            <Icon i="trash" size={14} />
          </button>
        </div>
      ))}
      {features.length < 10 && (
        <button
          type="button"
          onClick={() => onChange([...features, ''])}
          className="self-start rounded-md border border-slate-200 px-3 py-1.5 font-body text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          + Ajouter une fonctionnalité
        </button>
      )}
    </div>
  );
}

function FeatureList({ features }: { features: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2 font-body text-sm text-slate-700">
          <Icon i="check-circle" size={15} className="mt-0.5 flex-shrink-0 text-emerald-500" />
          {feature}
        </li>
      ))}
    </ul>
  );
}

export function PlansTab({ canEdit }: { canEdit: boolean }) {
  const { data, loading, error, refresh } = useApi<PlansResponse>(PLANS_PATH);
  const { toast } = useToast();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // FREE-plan draft fields
  const [maxClients, setMaxClients] = useState(0);
  const [maxActiveProjects, setMaxActiveProjects] = useState(0);
  // PRO-plan draft fields
  const [monthlyAmount, setMonthlyAmount] = useState(0);
  const [yearlyAmount, setYearlyAmount] = useState(0);
  const [currency, setCurrency] = useState('XOF');
  // Shared
  const [features, setFeatures] = useState<string[]>([]);

  function openEdit(plan: Plan, config: PlanConfig) {
    setEditing(plan);
    setMaxClients(config.maxClients ?? 0);
    setMaxActiveProjects(config.maxActiveProjects ?? 0);
    setMonthlyAmount(config.monthlyAmount ?? 0);
    setYearlyAmount(config.yearlyAmount ?? 0);
    setCurrency(config.currency);
    setFeatures(config.features);
  }

  function closeEdit() {
    setEditing(null);
  }

  async function submitEdit() {
    if (!editing) return;
    const cleanFeatures = features.map((f) => f.trim()).filter(Boolean);
    const body =
      editing === 'FREE'
        ? { maxClients, maxActiveProjects, features: cleanFeatures }
        : { monthlyAmount, yearlyAmount, currency, features: cleanFeatures };
    setSubmitting(true);
    try {
      await api(`/api/admin/plans/${editing}`, { method: 'PATCH', body });
      invalidateCache(PLANS_PATH);
      await refresh();
      toast('Plan mis à jour — appliqué dans tout le SaaS.', 'success');
      closeEdit();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${cardClass} flex flex-col gap-4 p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-headings text-base font-semibold text-slate-900">Gratuit</p>
              <p className="mt-1 font-headings text-2xl font-bold text-slate-900">0 FCFA</p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => openEdit('FREE', data.free)}
                className="flex-shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Modifier
              </button>
            )}
          </div>
          <div className="flex gap-4 font-body text-sm text-slate-600">
            <span>
              <span className="font-semibold text-slate-900">{data.free.maxClients ?? '∞'}</span>{' '}
              client(s)
            </span>
            <span>
              <span className="font-semibold text-slate-900">
                {data.free.maxActiveProjects ?? '∞'}
              </span>{' '}
              projet(s) actif(s)
            </span>
          </div>
          <FeatureList features={data.free.features} />
        </div>

        <div className={`${cardClass} flex flex-col gap-4 p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-headings text-base font-semibold text-slate-900">Pro</p>
              <p className="mt-1 font-headings text-2xl font-bold text-slate-900">
                {formatPrice(data.pro.monthlyAmount ?? 0, data.pro.currency)}
                <span className="ml-1 font-body text-xs font-normal text-slate-400">/mois</span>
              </p>
              <p className="font-body text-xs text-slate-400">
                ou {formatPrice(data.pro.yearlyAmount ?? 0, data.pro.currency)}/an
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => openEdit('PRO', data.pro)}
                className="flex-shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Modifier
              </button>
            )}
          </div>
          <FeatureList features={data.pro.features} />
        </div>
      </div>

      {editing && (
        <Modal
          title={`Modifier le plan ${editing === 'FREE' ? 'Gratuit' : 'Pro'}`}
          onClose={closeEdit}
        >
          <div className="mb-4 flex flex-col gap-3">
            {editing === 'FREE' ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="font-body text-xs font-medium text-slate-500">
                    Nombre maximum de clients
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={maxClients}
                    onChange={(e) => setMaxClients(Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-body text-xs font-medium text-slate-500">
                    Nombre maximum de projets actifs
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={maxActiveProjects}
                    onChange={(e) => setMaxActiveProjects(Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span className="font-body text-xs font-medium text-slate-500">Prix mensuel</span>
                  <input
                    type="number"
                    min={1}
                    value={monthlyAmount}
                    onChange={(e) => setMonthlyAmount(Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-body text-xs font-medium text-slate-500">Prix annuel</span>
                  <input
                    type="number"
                    min={1}
                    value={yearlyAmount}
                    onChange={(e) => setYearlyAmount(Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-body text-xs font-medium text-slate-500">
                    Devise (code à 3 lettres)
                  </span>
                  <input
                    type="text"
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className={inputClass}
                  />
                </label>
              </>
            )}
            <FeatureListEditor features={features} onChange={setFeatures} />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeEdit}
              className="rounded-md border border-slate-200 px-4 py-2 font-body text-sm font-medium text-slate-700"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitEdit()}
              className="rounded-md bg-emerald-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
