'use client';

// Super Admin — platform-wide AdminAlert feed (operational/security signals,
// distinct from the Journal d'audit which logs actions admins TAKE). Same
// list-with-filters shape as AuditLogTab.tsx, plus an acknowledge/resolve
// action per row (PATCH /api/admin/alerts/[id]).
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { formatLongDate } from '@/lib/utils';

interface AdminAlertRow {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface AdminAlertPage {
  items: AdminAlertRow[];
  nextCursor: string | null;
}

const SEVERITY_LABELS: Record<AdminAlertRow['severity'], string> = {
  INFO: 'Info',
  WARNING: 'Avertissement',
  CRITICAL: 'Critique',
};
const SEVERITY_COLORS: Record<AdminAlertRow['severity'], string> = {
  INFO: 'bg-muted text-muted-foreground',
  WARNING: 'bg-tag-orange text-tag-orange-fg',
  CRITICAL: 'bg-tag-red text-tag-red-fg',
};

const inputClass =
  'rounded-md border border-border bg-canvas px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';
const cardClass = 'rounded-xl border border-border bg-canvas p-5 shadow-card';

export default function AdminAlertsPage() {
  const [severity, setSeverity] = useState('');
  const [acknowledged, setAcknowledged] = useState('');
  const [items, setItems] = useState<AdminAlertRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (severity) params.set('severity', severity);
    if (acknowledged) params.set('acknowledged', acknowledged);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/alerts?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<AdminAlertPage>(buildQuery(cursor));
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
  }, [severity, acknowledged]);

  async function act(id: string, status: 'ACKNOWLEDGED' | 'RESOLVED') {
    setActingId(id);
    try {
      await api(`/api/admin/alerts/${id}`, { method: 'PATCH', body: { status } });
      await load(true, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setActingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground">Alertes plateforme</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Signaux opérationnels et de sécurité — paiements, webhooks, authentification.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-canvas p-4 shadow-card sm:flex-row sm:items-center">
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className={`${inputClass} flex-1`}
        >
          <option value="">Toutes les sévérités</option>
          <option value="CRITICAL">Critique</option>
          <option value="WARNING">Avertissement</option>
          <option value="INFO">Info</option>
        </select>
        <select
          value={acknowledged}
          onChange={(e) => setAcknowledged(e.target.value)}
          className={inputClass}
        >
          <option value="">Toutes</option>
          <option value="false">Non prises en compte</option>
          <option value="true">Prises en compte</option>
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(true, null)} />
      ) : items.length === 0 ? (
        <EmptyState icon="alert-circle" title="Aucune alerte" description="Rien à signaler." />
      ) : (
        <>
          <div className={cardClass}>
            {items.map((alert) => (
              <div key={alert.id} className="border-b border-border py-3.5 last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`flex-shrink-0 rounded-full px-2.5 py-1 font-body text-xs font-medium ${SEVERITY_COLORS[alert.severity]}`}
                      >
                        {SEVERITY_LABELS[alert.severity]}
                      </span>
                      <p className="font-body text-sm font-medium text-foreground">{alert.title}</p>
                    </div>
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      {alert.type} · {formatLongDate(alert.createdAt)}
                    </p>
                    <p className="mt-2 font-body text-sm text-foreground">{alert.body}</p>
                    {alert.resolvedAt ? (
                      <p className="mt-2 flex items-center gap-1.5 font-body text-xs font-medium text-emerald-600">
                        <Icon i="check-circle" size={12} />
                        Résolue
                      </p>
                    ) : alert.acknowledgedAt ? (
                      <p className="mt-2 font-body text-xs font-medium text-amber-600">
                        Prise en compte
                      </p>
                    ) : null}
                  </div>
                  {!alert.resolvedAt && (
                    <div className="flex flex-shrink-0 gap-2">
                      {!alert.acknowledgedAt && (
                        <button
                          type="button"
                          disabled={actingId === alert.id}
                          onClick={() => void act(alert.id, 'ACKNOWLEDGED')}
                          className="rounded-md border border-border px-3 py-1.5 font-body text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                        >
                          Prendre en compte
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={actingId === alert.id}
                        onClick={() => void act(alert.id, 'RESOLVED')}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 font-body text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Résoudre
                      </button>
                    </div>
                  )}
                </div>
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
