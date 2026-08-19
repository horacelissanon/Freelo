'use client';

// ADMIN can triage tickets (status change) — not gated to SUPERADMIN, this
// is routine support work. Styled like UsersTab.tsx: hardcoded slate/emerald,
// not the Freelo workspace theme tokens — this only ever renders inside the
// Super Admin console (app/admin/**).
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatLongDate } from '@/lib/utils';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

interface TicketRow {
  id: string;
  userId: string;
  subject: string;
  message: string;
  priority: Priority;
  status: Status;
  createdAt: string;
  user: { email: string; name: string | null };
}

interface TicketsPage {
  items: TicketRow[];
  nextCursor: string | null;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Basse',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
};
const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-tag-orange text-tag-orange-fg',
  HIGH: 'bg-tag-red text-tag-red-fg',
};

const STATUS_LABELS: Record<Status, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
};
const STATUS_COLORS: Record<Status, string> = {
  OPEN: 'bg-tag-red text-tag-red-fg',
  IN_PROGRESS: 'bg-tag-orange text-tag-orange-fg',
  RESOLVED: 'bg-tag-green text-tag-green-fg',
};

const inputClass =
  'rounded-md border border-border bg-canvas px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';
const cardClass = 'rounded-xl border border-border bg-canvas shadow-card';

export function SupportTicketsTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [items, setItems] = useState<TicketRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/support-tickets?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<TicketsPage>(buildQuery(cursor));
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
  }, [statusFilter, priorityFilter]);

  async function changeStatus(id: string, status: Status) {
    setUpdatingId(id);
    try {
      await api(`/api/admin/support-tickets/${id}`, { method: 'PATCH', body: { status } });
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
      toast('Statut mis à jour.');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau', 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div>
      <div className={`mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${cardClass}`}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)}
          className={inputClass}
        >
          <option value="all">Tous les statuts</option>
          <option value="OPEN">Ouvert</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="RESOLVED">Résolu</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as 'all' | Priority)}
          className={inputClass}
        >
          <option value="all">Toutes les priorités</option>
          <option value="HIGH">Haute</option>
          <option value="MEDIUM">Moyenne</option>
          <option value="LOW">Basse</option>
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(true, null)} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="message-circle"
          title="Aucun ticket"
          description="Aucune demande de support ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className={`p-5 ${cardClass}`}>
            {items.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 border-b border-border py-3.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{t.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.user.name || t.user.email} · {formatLongDate(t.createdAt)}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${PRIORITY_COLORS[t.priority]}`}
                >
                  {PRIORITY_LABELS[t.priority]}
                </span>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[t.status]}`}
                >
                  {STATUS_LABELS[t.status]}
                </span>
                <select
                  value={t.status}
                  disabled={updatingId === t.id}
                  onChange={(e) => void changeStatus(t.id, e.target.value as Status)}
                  aria-label={`Changer le statut du ticket ${t.subject}`}
                  className="flex-shrink-0 rounded-md border border-border bg-canvas px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                >
                  <option value="OPEN">Ouvert</option>
                  <option value="IN_PROGRESS">En cours</option>
                  <option value="RESOLVED">Résolu</option>
                </select>
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
    </div>
  );
}
