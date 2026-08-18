'use client';

// Styled with hardcoded slate/emerald classes, not the Freelo workspace's
// theme tokens — see the identical note in UsersTab.tsx. This component
// only ever renders inside the Super Admin console (app/admin/**).
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatLongDate } from '@/lib/utils';

interface AuditLogRow {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogPage {
  items: AuditLogRow[];
  nextCursor: string | null;
}

// Known action keys — see every `logAdminAction(tx, { action: '...' })` call
// site under frontend/src/app/api/admin/**. Unrecognized keys (from a
// future action type) still render fine via the raw-key fallback below.
const ACTION_LABELS: Record<string, string> = {
  'user.role_change': 'Changement de rôle',
  'user.suspend': 'Suspension de compte',
  'user.restore': 'Réactivation de compte',
  'withdrawal.cancel': 'Annulation de retrait',
  'subscription.override': "Modification d'abonnement",
  'outbox.requeue': "Relance d'événement",
  'email.requeue': "Relance d'email",
  BOOTSTRAP_SUPERADMIN: 'Bootstrap super-administrateur',
};

const inputClass =
  'rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';

export function AuditLogTab() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (action) params.set('action', action);
    if (targetType) params.set('targetType', targetType);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/audit-log?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<AuditLogPage>(buildQuery(cursor));
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
  }, [action, targetType]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className={`${inputClass} flex-1`}
        >
          <option value="">Toutes les actions</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          className={inputClass}
        >
          <option value="">Toutes les cibles</option>
          <option value="User">Utilisateur</option>
          <option value="Withdrawal">Retrait</option>
          <option value="Subscription">Abonnement</option>
          <option value="OutboxEvent">Événement</option>
          <option value="EmailJob">Email</option>
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(true, null)} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="file-clock"
          title="Aucune action"
          description="Aucune entrée ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {items.map((entry) => (
              <div key={entry.id} className="border-b border-slate-100 py-3.5 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </p>
                  <p className="text-xs text-slate-400">{formatLongDate(entry.createdAt)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {entry.targetType && (
                    <>
                      Cible : <span className="font-mono">{entry.targetType}</span>
                      {entry.targetId && (
                        <span className="font-mono"> #{entry.targetId.slice(0, 8)}</span>
                      )}
                      {' · '}
                    </>
                  )}
                  Par : <span className="font-mono">{entry.actorId}</span>
                  {entry.ip && <> · {entry.ip}</>}
                </p>
                {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                  <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
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
