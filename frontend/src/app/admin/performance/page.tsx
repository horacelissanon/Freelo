'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatLongDate } from '@/lib/utils';

type QueueStatus = 'PENDING' | 'SENT' | 'FAILED' | 'DEAD';

interface OutboxRow {
  id: string;
  kind: string;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  scheduledAt: string;
  createdAt: string;
}

interface EmailJobRow {
  id: string;
  to: string;
  subject: string;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

interface RateLimitBucket {
  bucket: string;
  totalKeys: number;
  top10: { key: string; hits: number; expiresAt: string | null }[];
  truncated?: boolean;
}

const STATUS_LABELS: Record<QueueStatus, string> = {
  PENDING: 'En attente',
  SENT: 'Envoyé',
  FAILED: 'Échoué',
  DEAD: 'Abandonné',
};
const STATUS_COLORS: Record<QueueStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  SENT: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  DEAD: 'bg-slate-100 text-slate-500',
};
const REQUEUABLE: ReadonlySet<QueueStatus> = new Set(['FAILED', 'DEAD']);

const inputClass =
  'rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';
const cardClass = 'rounded-xl border border-slate-200 bg-white shadow-sm';

function OutboxList({ canRequeue }: { canRequeue: boolean }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<'all' | QueueStatus>('all');
  const [items, setItems] = useState<OutboxRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requeuingId, setRequeuingId] = useState<string | null>(null);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (status !== 'all') params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/outbox?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<{ items: OutboxRow[]; nextCursor: string | null }>(buildQuery(cursor));
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

  async function requeue(id: string) {
    setRequeuingId(id);
    try {
      await api(`/api/admin/outbox/${id}/requeue`, { method: 'POST' });
      setItems((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'PENDING', attempts: 0 } : e)),
      );
      toast('Événement remis en file.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur réseau', 'error');
    } finally {
      setRequeuingId(null);
    }
  }

  return (
    <div>
      <div className={`mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${cardClass}`}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | QueueStatus)}
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
          icon="bar-chart"
          title="File vide"
          description="Aucun événement ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className={`p-5 ${cardClass}`}>
            {items.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-3.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-slate-800">{e.kind}</p>
                  <p className="truncate text-xs text-slate-400">
                    {e.attempts} tentative{e.attempts !== 1 ? 's' : ''} ·{' '}
                    {formatLongDate(e.createdAt)}
                    {e.lastError ? ` · ${e.lastError}` : ''}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[e.status]}`}
                >
                  {STATUS_LABELS[e.status]}
                </span>
                {canRequeue && REQUEUABLE.has(e.status) && (
                  <button
                    type="button"
                    disabled={requeuingId === e.id}
                    onClick={() => void requeue(e.id)}
                    className="flex-shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {requeuingId === e.id ? 'Relance…' : 'Relancer'}
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

function EmailQueueList({ canRequeue }: { canRequeue: boolean }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<'all' | QueueStatus>('all');
  const [items, setItems] = useState<EmailJobRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requeuingId, setRequeuingId] = useState<string | null>(null);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (status !== 'all') params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/email-queue?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<{ items: EmailJobRow[]; nextCursor: string | null }>(
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

  async function requeue(id: string) {
    setRequeuingId(id);
    try {
      await api(`/api/admin/email-queue/${id}/requeue`, { method: 'POST' });
      setItems((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'PENDING', attempts: 0 } : e)),
      );
      toast('Email remis en file.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur réseau', 'error');
    } finally {
      setRequeuingId(null);
    }
  }

  return (
    <div>
      <div className={`mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${cardClass}`}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | QueueStatus)}
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
          icon="mail"
          title="File vide"
          description="Aucun email ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className={`p-5 ${cardClass}`}>
            {items.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-3.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{e.subject}</p>
                  <p className="truncate text-xs text-slate-400">
                    {e.to} · {formatLongDate(e.createdAt)}
                    {e.lastError ? ` · ${e.lastError}` : ''}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[e.status]}`}
                >
                  {STATUS_LABELS[e.status]}
                </span>
                {canRequeue && REQUEUABLE.has(e.status) && (
                  <button
                    type="button"
                    disabled={requeuingId === e.id}
                    onClick={() => void requeue(e.id)}
                    className="flex-shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {requeuingId === e.id ? 'Relance…' : 'Relancer'}
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

function RateLimitsPanel() {
  const { data, loading, error, refresh } = useApi<{ buckets: RateLimitBucket[]; note?: string }>(
    '/api/admin/rate-limits',
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data || data.note) {
    return (
      <EmptyState
        icon="bar-chart"
        title="Redis non configuré"
        description="Aucune donnée de rate-limiting disponible sans Upstash Redis."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {data.buckets.map((b) => (
        <div key={b.bucket} className={`p-4 ${cardClass}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-sm font-medium text-slate-800">{b.bucket}</p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {b.totalKeys} clé{b.totalKeys !== 1 ? 's' : ''}
              {b.truncated ? '+' : ''}
            </span>
          </div>
          {b.top10.length === 0 ? (
            <p className="font-body text-xs text-slate-400">Aucune activité.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {b.top10.slice(0, 5).map((entry) => (
                <div key={entry.key} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-slate-500">{entry.key}</span>
                  <span className="flex-shrink-0 font-body text-xs font-medium text-slate-700">
                    {entry.hits}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AdminPerformancePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'outbox' | 'email' | 'rate-limits'>('outbox');
  const canRequeue = user?.role === 'SUPERADMIN';

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-slate-900">Performances</h1>
        <p className="font-body text-sm text-slate-500">
          Files d&apos;attente asynchrones et limites de débit de l&apos;infrastructure.
        </p>
      </header>

      <div className="mb-4 flex items-center gap-1 border-b border-slate-200 font-body">
        {(
          [
            { key: 'outbox', label: "File d'événements" },
            { key: 'email', label: "File d'emails" },
            { key: 'rate-limits', label: 'Limites de débit' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'outbox' && <OutboxList canRequeue={canRequeue} />}
      {tab === 'email' && <EmailQueueList canRequeue={canRequeue} />}
      {tab === 'rate-limits' && <RateLimitsPanel />}
    </div>
  );
}
