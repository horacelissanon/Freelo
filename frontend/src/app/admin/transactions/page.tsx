'use client';

// SaaS-own revenue: a freelancer paying Merrudit for their Pro subscription
// (SubscriptionTransaction). NOT Orders/Withdrawals (an end client paying a
// freelancer, and a freelancer's payout) — those stay unwired from the admin
// console; they're a different money flow than what "Transactions" means
// for a platform operator.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatLongDate, formatPrice } from '@/lib/utils';

type TxStatus = 'PENDING' | 'PAID' | 'FAILED';

interface SubscriptionTransactionRow {
  id: string;
  amount: number;
  currency: string;
  billingCycle: 'MONTHLY' | 'YEARLY';
  status: TxStatus;
  provider: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  subscription: { user: { email: string; name: string | null } };
}

const STATUS_LABELS: Record<TxStatus, string> = {
  PENDING: 'En attente',
  PAID: 'Payée',
  FAILED: 'Échouée',
};
const STATUS_COLORS: Record<TxStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
};

const inputClass =
  'rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';
const cardClass = 'rounded-xl border border-slate-200 bg-white shadow-sm';

export default function AdminTransactionsPage() {
  const [status, setStatus] = useState<'all' | TxStatus>('all');
  const [items, setItems] = useState<SubscriptionTransactionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (status !== 'all') params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/subscription-transactions?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<{ items: SubscriptionTransactionRow[]; nextCursor: string | null }>(
        buildQuery(cursor),
      );
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
  }, [status]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-slate-900">Facturation</h1>
        <p className="font-body text-sm text-slate-500">
          Paiements d&apos;abonnement Pro reçus par la plateforme.
        </p>
      </header>

      <div className={`mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${cardClass}`}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | TxStatus)}
          className={inputClass}
        >
          <option value="all">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(true, null)} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="banknote"
          title="Aucune transaction"
          description="Aucun paiement d'abonnement ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className={`p-5 ${cardClass}`}>
            {items.map((tx) => (
              <div
                key={tx.id}
                className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-3.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {tx.subscription.user.name || tx.subscription.user.email}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {tx.subscription.user.email} · {tx.provider} · {formatLongDate(tx.createdAt)}
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {tx.billingCycle === 'MONTHLY' ? 'Mensuel' : 'Annuel'}
                </span>
                <span className="flex-shrink-0 font-body text-sm font-semibold text-slate-800">
                  {formatPrice(tx.amount, tx.currency)}
                </span>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[tx.status]}`}
                >
                  {STATUS_LABELS[tx.status]}
                </span>
              </div>
            ))}
          </div>
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load(false, nextCursor)}
                className="rounded-md border border-slate-200 px-4 py-2 font-body text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore ? 'Chargement…' : 'Charger plus'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
