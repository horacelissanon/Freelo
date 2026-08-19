'use client';

// SUPERADMIN can override plan/status/currentPeriodEnd via
// PATCH /api/admin/subscriptions/[id] — a comp/support gesture, not the
// normal purchase flow. Styled like UsersTab.tsx: hardcoded slate/emerald,
// not the Freelo workspace theme tokens.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/lib/useApi';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatLongDate, formatPrice } from '@/lib/utils';

type Plan = 'FREE' | 'PRO';
type SubStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

interface SubscriptionRow {
  id: string;
  userId: string;
  plan: Plan;
  status: SubStatus;
  billingCycle: 'MONTHLY' | 'YEARLY' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  user: { email: string; name: string | null };
  transactions: { status: PaymentStatus }[];
}

interface SubscriptionsPage {
  items: SubscriptionRow[];
  nextCursor: string | null;
}

interface OverviewKpis {
  mrr: number;
  mrrCurrency: string;
  activeSubscribers: number;
  planDistribution: { free: number; pro: number };
  churnRate: number;
}

interface PlansResponse {
  pro: { monthlyAmount: number | null; yearlyAmount: number | null; currency: string };
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: 'À jour',
  FAILED: 'Échoué',
  PENDING: 'En attente',
};
const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PAID: 'bg-tag-green text-tag-green-fg',
  FAILED: 'bg-tag-red text-tag-red-fg',
  PENDING: 'bg-tag-orange text-tag-orange-fg',
};

const PLAN_LABELS: Record<Plan, string> = { FREE: 'Gratuit', PRO: 'Pro' };
const PLAN_COLORS: Record<Plan, string> = {
  FREE: 'bg-muted text-muted-foreground',
  PRO: 'bg-tag-green text-tag-green-fg',
};

const STATUS_LABELS: Record<SubStatus, string> = {
  ACTIVE: 'Actif',
  PAST_DUE: 'Paiement en retard',
  CANCELED: 'Annulé',
  EXPIRED: 'Expiré',
};

const STATUS_COLORS: Record<SubStatus, string> = {
  ACTIVE: 'bg-tag-green text-tag-green-fg',
  PAST_DUE: 'bg-tag-orange text-tag-orange-fg',
  CANCELED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-tag-red text-tag-red-fg',
};

const inputClass =
  'rounded-md border border-border bg-canvas px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';
const cardClass = 'rounded-xl border border-border bg-canvas shadow-card';

// HTML <input type="date"> only speaks "YYYY-MM-DD" — the API wants a full
// ISO 8601 datetime, midnight UTC is an arbitrary but stable convention.
function toIsoDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00.000Z`).toISOString();
}
function toDateOnly(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export function SubscriptionsTab({ canOverride }: { canOverride: boolean }) {
  const { toast } = useToast();
  const { data: kpis } = useApi<OverviewKpis>('/api/admin/overview');
  const { data: plans } = useApi<PlansResponse>('/api/plans');
  const [planFilter, setPlanFilter] = useState<'all' | Plan>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SubStatus>('all');
  const [items, setItems] = useState<SubscriptionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);
  const [formPlan, setFormPlan] = useState<Plan>('FREE');
  const [formStatus, setFormStatus] = useState<SubStatus>('ACTIVE');
  const [formPeriodEnd, setFormPeriodEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (planFilter !== 'all') params.set('plan', planFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/subscriptions?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<SubscriptionsPage>(buildQuery(cursor));
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load(true, null);
  }, [planFilter, statusFilter]);

  function openEdit(s: SubscriptionRow) {
    setEditing(s);
    setFormPlan(s.plan);
    setFormStatus(s.status);
    setFormPeriodEnd(toDateOnly(s.currentPeriodEnd));
  }

  function closeEdit() {
    setEditing(null);
  }

  async function submitEdit() {
    if (!editing) return;
    setSubmitting(true);
    try {
      const res = await api<{ subscription: SubscriptionRow }>(
        `/api/admin/subscriptions/${editing.id}`,
        {
          method: 'PATCH',
          body: {
            plan: formPlan,
            status: formStatus,
            currentPeriodEnd: formPeriodEnd ? toIsoDate(formPeriodEnd) : null,
          },
        },
      );
      setItems((prev) =>
        prev.map((s) =>
          s.id === editing.id
            ? {
                ...s,
                plan: res.subscription.plan,
                status: res.subscription.status,
                currentPeriodEnd: res.subscription.currentPeriodEnd,
              }
            : s,
        ),
      );
      toast('Abonnement mis à jour.');
      closeEdit();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {kpis && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className={`${cardClass} p-4`}>
            <p className="font-body text-xs text-muted-foreground">MRR</p>
            <p className="mt-1 font-headings text-xl font-bold text-foreground">
              {formatPrice(kpis.mrr, kpis.mrrCurrency)}
            </p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="font-body text-xs text-muted-foreground">Abonnés Pro actifs</p>
            <p className="mt-1 font-headings text-xl font-bold text-foreground">
              {kpis.activeSubscribers}
            </p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="font-body text-xs text-muted-foreground">Comptes gratuits</p>
            <p className="mt-1 font-headings text-xl font-bold text-foreground">
              {kpis.planDistribution.free}
            </p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="font-body text-xs text-muted-foreground">Total comptes</p>
            <p className="mt-1 font-headings text-xl font-bold text-foreground">
              {kpis.planDistribution.free + kpis.planDistribution.pro}
            </p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="font-body text-xs text-muted-foreground">Taux de churn</p>
            <p className="mt-1 font-headings text-xl font-bold text-foreground">
              {kpis.churnRate}%
            </p>
          </div>
        </div>
      )}

      <div className={`mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${cardClass}`}>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as 'all' | Plan)}
          className={inputClass}
        >
          <option value="all">Tous les plans</option>
          <option value="FREE">Gratuit</option>
          <option value="PRO">Pro</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | SubStatus)}
          className={inputClass}
        >
          <option value="all">Tous les statuts</option>
          <option value="ACTIVE">Actif</option>
          <option value="PAST_DUE">Paiement en retard</option>
          <option value="CANCELED">Annulé</option>
          <option value="EXPIRED">Expiré</option>
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(true, null)} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="credit-card"
          title="Aucun abonnement"
          description="Aucun abonnement ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className={`p-5 ${cardClass}`}>
            {items.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-3 border-b border-border py-3.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {s.user.name || s.user.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{s.user.email}</p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${PLAN_COLORS[s.plan]}`}
                >
                  {PLAN_LABELS[s.plan]}
                </span>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[s.status]}`}
                >
                  {STATUS_LABELS[s.status]}
                </span>
                {s.billingCycle && plans && (
                  <span className="flex-shrink-0 font-body text-sm font-semibold text-foreground">
                    {s.billingCycle === 'MONTHLY'
                      ? formatPrice(plans.pro.monthlyAmount ?? 0, `${plans.pro.currency}/mois`)
                      : formatPrice(plans.pro.yearlyAmount ?? 0, `${plans.pro.currency}/an`)}
                  </span>
                )}
                {s.transactions[0] && (
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${PAYMENT_STATUS_COLORS[s.transactions[0].status]}`}
                  >
                    {PAYMENT_STATUS_LABELS[s.transactions[0].status]}
                  </span>
                )}
                <span className="flex-shrink-0 font-body text-xs text-muted-foreground">
                  {s.currentPeriodEnd
                    ? `${s.cancelAtPeriodEnd ? 'Se termine' : 'Renouvelle'} le ${formatLongDate(s.currentPeriodEnd)}`
                    : '—'}
                </span>
                {canOverride && (
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="flex-shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    Modifier
                  </button>
                )}
              </div>
            ))}
          </div>

          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load(false, nextCursor)}
                className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
              >
                {loadingMore ? 'Chargement…' : 'Charger plus'}
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <Modal title="Modifier l'abonnement" onClose={closeEdit}>
          <p className="mb-4 font-body text-sm text-foreground">
            Compte : <span className="font-medium">{editing.user.name || editing.user.email}</span>
          </p>
          <div className="mb-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs font-medium text-muted-foreground">Plan</span>
              <select
                value={formPlan}
                onChange={(e) => setFormPlan(e.target.value as Plan)}
                className={inputClass}
              >
                <option value="FREE">Gratuit</option>
                <option value="PRO">Pro</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs font-medium text-muted-foreground">Statut</span>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as SubStatus)}
                className={inputClass}
              >
                <option value="ACTIVE">Actif</option>
                <option value="PAST_DUE">Paiement en retard</option>
                <option value="CANCELED">Annulé</option>
                <option value="EXPIRED">Expiré</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs font-medium text-muted-foreground">
                Fin de période (optionnel)
              </span>
              <input
                type="date"
                value={formPeriodEnd}
                onChange={(e) => setFormPeriodEnd(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeEdit}
              className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
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
