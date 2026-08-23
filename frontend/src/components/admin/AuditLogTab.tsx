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
  actor: { email: string; name: string | null } | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
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
  'user.grant_pro': 'Passage en Pro (offert)',
  'user.revoke_pro': 'Annulation de Pro',
  'withdrawal.cancel': 'Annulation de retrait',
  'subscription.override': "Modification d'abonnement",
  'plan.update': 'Modification de plan',
  'outbox.requeue': "Relance d'événement",
  'email.requeue': "Relance d'email",
  'support.status_change': 'Changement de statut de ticket',
  'alert.acknowledge': "Prise en compte d'alerte",
  'alert.resolve': "Résolution d'alerte",
  BOOTSTRAP_SUPERADMIN: 'Bootstrap super-administrateur',
};

// Turns raw metadata into a human sentence, per action type — this is the
// concrete fix for "je ne comprends pas le journal d'audit": a JSON blob of
// {from, to} tells a human nothing without knowing the schema by heart.
// Unrecognized action types fall back to the raw JSON dump below, nothing
// is ever hidden — just improved for the types we know about.
function describeAction(action: string, metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const m = metadata as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

  switch (action) {
    case 'user.role_change':
      return `Rôle changé de ${str(m.from)} à ${str(m.to)}`;
    case 'user.suspend':
    case 'user.restore':
      return `Statut changé de ${str(m.from)} à ${str(m.to)}${m.reason ? ` — ${str(m.reason)}` : ''}`;
    case 'user.grant_pro':
    case 'user.revoke_pro': {
      const from = m.from as Record<string, unknown> | undefined;
      const to = m.to as Record<string, unknown> | undefined;
      return `Plan ${str(from?.plan)} → ${str(to?.plan)}${m.reason ? ` — ${str(m.reason)}` : ''}`;
    }
    case 'subscription.override': {
      const from = m.from as Record<string, unknown> | undefined;
      const to = m.to as Record<string, unknown> | undefined;
      return `Plan ${str(from?.plan)} → ${str(to?.plan)}, statut ${str(from?.status)} → ${str(to?.status)}`;
    }
    case 'plan.update': {
      const from = m.from as Record<string, unknown> | undefined;
      const to = m.to as Record<string, unknown> | undefined;
      const FIELD_LABELS: Record<string, string> = {
        monthlyAmount: 'Prix mensuel',
        yearlyAmount: 'Prix annuel',
        currency: 'Devise',
        maxClients: 'Limite clients',
        maxActiveProjects: 'Limite projets actifs',
        features: 'Fonctionnalités',
      };
      const changes = Object.keys(to ?? {}).map(
        (key) => `${FIELD_LABELS[key] ?? key} : ${str(from?.[key])} → ${str(to?.[key])}`,
      );
      return changes.length > 0 ? changes.join(', ') : null;
    }
    case 'outbox.requeue':
    case 'email.requeue':
      return `Relancé (était ${str(m.previousStatus)}, ${str(m.previousAttempts)} tentative(s))`;
    case 'withdrawal.cancel':
      return `Retrait annulé : ${str(m.reason)}`;
    case 'support.status_change':
      return `Statut du ticket changé de ${str(m.from)} à ${str(m.to)}`;
    case 'alert.acknowledge':
    case 'alert.resolve':
      return `${str(m.type)} (${str(m.severity)})`;
    case 'BOOTSTRAP_SUPERADMIN':
      return 'Promu super-administrateur via script CLI';
    default:
      return null;
  }
}

const inputClass =
  'rounded-md border border-border bg-canvas px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';

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
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-canvas p-4 shadow-card sm:flex-row sm:items-center">
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
          <option value="SupportTicket">Ticket support</option>
          <option value="PlanConfig">Plan</option>
          <option value="AdminAlert">Alerte</option>
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
          <div className="rounded-xl border border-border bg-canvas p-5 shadow-card">
            {items.map((entry) => {
              const sentence = describeAction(entry.action, entry.metadata);
              const targetDisplay =
                entry.targetLabel ?? (entry.targetId ? `#${entry.targetId.slice(0, 8)}` : null);
              return (
                <div key={entry.id} className="border-b border-border py-3.5 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatLongDate(entry.createdAt)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.targetType && (
                      <>
                        Cible : {entry.targetType === 'User' ? '' : `${entry.targetType} `}
                        <span className={entry.targetLabel ? '' : 'font-mono'}>
                          {targetDisplay}
                        </span>
                        {' · '}
                      </>
                    )}
                    Par :{' '}
                    <span className={entry.actor ? '' : 'font-mono'}>
                      {entry.actor ? entry.actor.name || entry.actor.email : entry.actorId}
                    </span>
                    {entry.ip && <> · {entry.ip}</>}
                  </p>
                  {sentence ? (
                    <p className="mt-2 text-sm text-foreground">{sentence}</p>
                  ) : (
                    entry.metadata &&
                    Object.keys(entry.metadata).length > 0 && (
                      <pre className="mt-2 overflow-x-auto rounded-md bg-secondary px-3 py-2 font-mono text-xs text-muted-foreground">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )
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
