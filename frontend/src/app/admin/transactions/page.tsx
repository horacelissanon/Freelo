'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatLongDate, formatPrice } from '@/lib/utils';

type OrderStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUNDED';
type WithdrawalStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface OrderRow {
  id: string;
  userId: string | null;
  amount: number;
  currency: string;
  status: OrderStatus;
  customerEmail: string | null;
  provider: string;
  paidAt: string | null;
  createdAt: string;
}

interface WithdrawalRow {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: WithdrawalStatus;
  destination: { method?: string; phone?: string } | null;
  provider: string;
  failureReason: string | null;
  requestedAt: string;
  completedAt: string | null;
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  PAID: 'Payée',
  EXPIRED: 'Expirée',
  FAILED: 'Échouée',
  REFUNDED: 'Remboursée',
};
const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  EXPIRED: 'bg-slate-100 text-slate-500',
  FAILED: 'bg-red-50 text-red-700',
  REFUNDED: 'bg-purple-50 text-purple-700',
};

const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  COMPLETED: 'Terminé',
  FAILED: 'Échoué',
  CANCELLED: 'Annulé',
};
const WITHDRAWAL_STATUS_COLORS: Record<WithdrawalStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  PROCESSING: 'bg-purple-50 text-purple-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const inputClass =
  'rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';
const cardClass = 'rounded-xl border border-slate-200 bg-white shadow-sm';

function OrdersList() {
  const [status, setStatus] = useState<'all' | OrderStatus>('all');
  const [items, setItems] = useState<OrderRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (status !== 'all') params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/orders?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<{ items: OrderRow[]; nextCursor: string | null }>(buildQuery(cursor));
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
      <div className={`mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${cardClass}`}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | OrderStatus)}
          className={inputClass}
        >
          <option value="all">Tous les statuts</option>
          {Object.entries(ORDER_STATUS_LABELS).map(([k, l]) => (
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
          title="Aucune commande"
          description="Aucune commande ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className={`p-5 ${cardClass}`}>
            {items.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-3.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {o.customerEmail || 'Client anonyme'}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {o.provider} · {formatLongDate(o.createdAt)}
                  </p>
                </div>
                <span className="flex-shrink-0 font-body text-sm font-semibold text-slate-800">
                  {formatPrice(o.amount, o.currency)}
                </span>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[o.status]}`}
                >
                  {ORDER_STATUS_LABELS[o.status]}
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

function WithdrawalsList({ canCancel }: { canCancel: boolean }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<'all' | WithdrawalStatus>('all');
  const [items, setItems] = useState<WithdrawalRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<WithdrawalRow | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (status !== 'all') params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/withdrawals?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<{ items: WithdrawalRow[]; nextCursor: string | null }>(
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

  async function confirmCancel() {
    if (!cancelTarget || !reason.trim()) return;
    setSubmitting(true);
    try {
      await api(`/api/admin/withdrawals/${cancelTarget.id}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim() },
      });
      setItems((prev) =>
        prev.map((w) => (w.id === cancelTarget.id ? { ...w, status: 'CANCELLED' } : w)),
      );
      toast('Retrait annulé.');
      setCancelTarget(null);
      setReason('');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.code === 'WITHDRAWAL_NOT_CANCELLABLE'
            ? 'Ce retrait a déjà été traité — il ne peut plus être annulé.'
            : err.message
          : 'Erreur réseau';
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className={`mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${cardClass}`}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | WithdrawalStatus)}
          className={inputClass}
        >
          <option value="all">Tous les statuts</option>
          {Object.entries(WITHDRAWAL_STATUS_LABELS).map(([k, l]) => (
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
          icon="wallet"
          title="Aucun retrait"
          description="Aucun retrait ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className={`p-5 ${cardClass}`}>
            {items.map((w) => {
              const cancellable =
                canCancel && (w.status === 'PENDING' || w.status === 'PROCESSING');
              return (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-3.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {w.destination?.phone || w.userId}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {w.destination?.method ?? w.provider} · {formatLongDate(w.requestedAt)}
                    </p>
                  </div>
                  <span className="flex-shrink-0 font-body text-sm font-semibold text-slate-800">
                    {formatPrice(w.amount, w.currency)}
                  </span>
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${WITHDRAWAL_STATUS_COLORS[w.status]}`}
                  >
                    {WITHDRAWAL_STATUS_LABELS[w.status]}
                  </span>
                  {cancellable && (
                    <button
                      type="button"
                      onClick={() => setCancelTarget(w)}
                      className="flex-shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              );
            })}
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

      {cancelTarget && (
        <Modal
          title="Annuler le retrait"
          onClose={() => {
            setCancelTarget(null);
            setReason('');
          }}
        >
          <p className="mb-4 font-body text-sm text-slate-700">
            Annuler le retrait de{' '}
            <span className="font-medium">
              {formatPrice(cancelTarget.amount, cancelTarget.currency)}
            </span>{' '}
            ?
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Raison (obligatoire)"
            rows={3}
            maxLength={500}
            className={`${inputClass} mb-4 w-full resize-none`}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCancelTarget(null);
                setReason('');
              }}
              className="rounded-md border border-slate-200 px-4 py-2 font-body text-sm font-medium text-slate-700"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={submitting || !reason.trim()}
              onClick={() => void confirmCancel()}
              className="rounded-md bg-red-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? 'Confirmation…' : 'Confirmer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function AdminTransactionsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'orders' | 'withdrawals'>('orders');

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-slate-900">Transactions</h1>
        <p className="font-body text-sm text-slate-500">
          Paiements clients (commandes) et retraits des freelances.
        </p>
      </header>

      <div className="mb-4 flex items-center gap-1 border-b border-slate-200 font-body">
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            tab === 'orders'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-400'
          }`}
        >
          Commandes
        </button>
        <button
          type="button"
          onClick={() => setTab('withdrawals')}
          className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            tab === 'withdrawals'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-400'
          }`}
        >
          Retraits
        </button>
      </div>

      {tab === 'orders' ? (
        <OrdersList />
      ) : (
        <WithdrawalsList canCancel={user?.role === 'SUPERADMIN'} />
      )}
    </div>
  );
}
