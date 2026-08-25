'use client';

// Styled with hardcoded slate/emerald classes, not the ZeFacto workspace's
// theme tokens (bg-canvas/border-border/text-primary/...) — this component
// only ever renders inside the Super Admin console (app/admin/**), which is
// deliberately its own fixed-light visual identity, independent of a
// freelancer's dark/light mode or accent-color preference.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatLongDate, relativeTime } from '@/lib/utils';

type Role = 'USER' | 'ADMIN' | 'SUPERADMIN';
type Status = 'ACTIVE' | 'SUSPENDED';
type Plan = 'FREE' | 'PRO';

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  status: Status;
  emailVerifiedAt: string | null;
  createdAt: string;
  subscription: { plan: Plan; isProActive: boolean } | null;
  sessions: { lastSeenAt: string }[];
}

const PLAN_COLORS: Record<Plan, string> = {
  FREE: 'bg-muted text-muted-foreground',
  PRO: 'bg-tag-green text-tag-green-fg',
};

interface UsersPage {
  items: AdminUserRow[];
  nextCursor: string | null;
}

const ROLE_LABELS: Record<Role, string> = {
  USER: 'Utilisateur',
  ADMIN: 'Admin',
  SUPERADMIN: 'Super-admin',
};

const ROLE_COLORS: Record<Role, string> = {
  USER: 'bg-muted text-muted-foreground',
  ADMIN: 'bg-purple-50 text-purple-700',
  SUPERADMIN: 'bg-tag-orange text-tag-orange-fg',
};

const inputClass =
  'rounded-md border border-border bg-canvas px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';

type PendingAction =
  | { kind: 'role'; user: AdminUserRow; newRole: Role }
  | { kind: 'suspend'; user: AdminUserRow }
  | { kind: 'restore'; user: AdminUserRow }
  | { kind: 'grant_pro'; user: AdminUserRow }
  | { kind: 'revoke_pro'; user: AdminUserRow };

// Server error codes surfaced by PATCH .../role, .../status and
// .../subscription — see frontend/src/app/api/admin/users/[id]/{role,status,subscription}/route.ts.
const ERROR_MESSAGES: Record<string, string> = {
  LAST_SUPERADMIN: 'Impossible de rétrograder le dernier super-administrateur.',
  RESTORE_REQUIRES_SUPERADMIN: 'Seul un super-administrateur peut réactiver ce compte.',
  SUSPEND_REQUIRES_SUPERADMIN:
    'Seul un super-administrateur peut suspendre un super-administrateur.',
  USER_NOT_FOUND: 'Ce compte est introuvable — il a peut-être été supprimé.',
};

export function UsersTab({ viewerRole, viewerId }: { viewerRole: Role; viewerId: string }) {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Debounce free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  function buildQuery(cursor: string | null): string {
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (q) params.set('q', q);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (cursor) params.set('cursor', cursor);
    return `/api/admin/users?${params.toString()}`;
  }

  async function load(reset: boolean, cursor: string | null) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api<UsersPage>(buildQuery(cursor));
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
  }, [q, statusFilter, roleFilter]);

  function closePending() {
    setPending(null);
    setReason('');
  }

  async function submitPending() {
    if (!pending) return;
    setSubmitting(true);
    try {
      if (pending.kind === 'role') {
        const res = await api<{ user: { id: string; role: Role } }>(
          `/api/admin/users/${pending.user.id}/role`,
          { method: 'PATCH', body: { role: pending.newRole } },
        );
        setItems((prev) =>
          prev.map((u) => (u.id === res.user.id ? { ...u, role: res.user.role } : u)),
        );
        toast(`Rôle mis à jour : ${ROLE_LABELS[res.user.role]}.`);
      } else if (pending.kind === 'grant_pro' || pending.kind === 'revoke_pro') {
        const res = await api<{ subscription: { plan: Plan; isProActive: boolean } }>(
          `/api/admin/users/${pending.user.id}/subscription`,
          {
            method: 'PATCH',
            body: {
              action: pending.kind === 'grant_pro' ? 'grant' : 'revoke',
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            },
          },
        );
        const userId = pending.user.id;
        setItems((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, subscription: res.subscription } : u)),
        );
        toast(pending.kind === 'grant_pro' ? 'Compte passé en Pro.' : 'Abonnement Pro annulé.');
      } else {
        const status: Status = pending.kind === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
        const res = await api<{ user: { id: string; status: Status } }>(
          `/api/admin/users/${pending.user.id}/status`,
          {
            method: 'PATCH',
            body: { status, ...(reason.trim() ? { reason: reason.trim() } : {}) },
          },
        );
        setItems((prev) =>
          prev.map((u) => (u.id === res.user.id ? { ...u, status: res.user.status } : u)),
        );
        toast(pending.kind === 'suspend' ? 'Compte suspendu.' : 'Compte réactivé.');
      }
      closePending();
    } catch (err) {
      const message =
        err instanceof ApiError ? (ERROR_MESSAGES[err.code] ?? err.message) : 'Erreur réseau';
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-canvas p-4 shadow-card sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Rechercher (nom, email)…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={`${inputClass} flex-1`}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)}
          className={inputClass}
        >
          <option value="all">Tous les statuts</option>
          <option value="ACTIVE">Actifs</option>
          <option value="SUSPENDED">Suspendus</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'all' | Role)}
          className={inputClass}
        >
          <option value="all">Tous les rôles</option>
          <option value="USER">Utilisateur</option>
          <option value="ADMIN">Admin</option>
          <option value="SUPERADMIN">Super-admin</option>
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(true, null)} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="users"
          title="Aucun utilisateur"
          description="Aucun compte ne correspond à ces filtres."
        />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-canvas p-5 shadow-card">
            {items.map((u) => {
              const isSelf = u.id === viewerId;
              const canChangeRole = viewerRole === 'SUPERADMIN' && !isSelf;
              const canSuspend =
                u.status === 'ACTIVE' &&
                !isSelf &&
                (u.role !== 'SUPERADMIN' || viewerRole === 'SUPERADMIN');
              const canRestore = u.status === 'SUSPENDED' && viewerRole === 'SUPERADMIN' && !isSelf;
              const canManageSubscription = viewerRole === 'SUPERADMIN' && !isSelf;
              const isPro = u.subscription?.isProActive ?? false;
              return (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center gap-3 border-b border-border py-3.5 last:border-b-0"
                >
                  <Avatar name={u.name || u.email} className="h-9 w-9 flex-shrink-0 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {u.name || u.email}
                      {isSelf && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(vous)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email} · Inscrit le {formatLongDate(u.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_COLORS[u.role]}`}
                  >
                    {ROLE_LABELS[u.role]}
                  </span>
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      u.status === 'ACTIVE'
                        ? 'bg-tag-green text-tag-green-fg'
                        : 'bg-tag-red text-tag-red-fg'
                    }`}
                  >
                    {u.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                  </span>
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${PLAN_COLORS[isPro ? 'PRO' : 'FREE']}`}
                  >
                    {isPro ? 'Pro' : 'Gratuit'}
                  </span>
                  <span className="flex-shrink-0 font-body text-xs text-muted-foreground">
                    {u.sessions[0] ? relativeTime(u.sessions[0].lastSeenAt) : 'Jamais connecté'}
                  </span>
                  {canChangeRole && (
                    <select
                      value={u.role}
                      onChange={(e) =>
                        setPending({ kind: 'role', user: u, newRole: e.target.value as Role })
                      }
                      aria-label={`Changer le rôle de ${u.email}`}
                      className="flex-shrink-0 rounded-md border border-border bg-canvas px-2 py-1.5 text-xs text-foreground"
                    >
                      <option value="USER">Utilisateur</option>
                      <option value="ADMIN">Admin</option>
                      <option value="SUPERADMIN">Super-admin</option>
                    </select>
                  )}
                  {canSuspend && (
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'suspend', user: u })}
                      className="flex-shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      Suspendre
                    </button>
                  )}
                  {canRestore && (
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'restore', user: u })}
                      className="flex-shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      Réactiver
                    </button>
                  )}
                  {canManageSubscription &&
                    (isPro ? (
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'revoke_pro', user: u })}
                        className="flex-shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                      >
                        Repasser en Gratuit
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'grant_pro', user: u })}
                        className="flex-shrink-0 rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        Passer en Pro
                      </button>
                    ))}
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

      {pending && (
        <Modal
          title={
            pending.kind === 'role'
              ? 'Changer le rôle'
              : pending.kind === 'suspend'
                ? 'Suspendre le compte'
                : pending.kind === 'restore'
                  ? 'Réactiver le compte'
                  : pending.kind === 'grant_pro'
                    ? 'Passer le compte en Pro'
                    : 'Repasser le compte en Gratuit'
          }
          onClose={closePending}
        >
          <p className="mb-4 font-body text-sm text-foreground">
            {pending.kind === 'role' && (
              <>
                Passer <span className="font-medium">{pending.user.email}</span> de{' '}
                <span className="font-medium">{ROLE_LABELS[pending.user.role]}</span> à{' '}
                <span className="font-medium">{ROLE_LABELS[pending.newRole]}</span> ?
              </>
            )}
            {pending.kind === 'suspend' && (
              <>
                Suspendre l&apos;accès de <span className="font-medium">{pending.user.email}</span>{' '}
                ? Le compte ne pourra plus se connecter tant qu&apos;il n&apos;est pas réactivé.
              </>
            )}
            {pending.kind === 'restore' && (
              <>
                Réactiver l&apos;accès de <span className="font-medium">{pending.user.email}</span>{' '}
                ?
              </>
            )}
            {pending.kind === 'grant_pro' && (
              <>
                Offrir un mois de Pro à <span className="font-medium">{pending.user.email}</span> ?
                C&apos;est un geste commercial/support — aucun paiement n&apos;est déclenché.
              </>
            )}
            {pending.kind === 'revoke_pro' && (
              <>
                Repasser <span className="font-medium">{pending.user.email}</span> en plan Gratuit ?
                Son accès Pro s&apos;arrête immédiatement.
              </>
            )}
          </p>
          {(pending.kind === 'suspend' ||
            pending.kind === 'grant_pro' ||
            pending.kind === 'revoke_pro') && (
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Commentaire (optionnel)"
              rows={3}
              maxLength={500}
              className={`${inputClass} mb-4 w-full resize-none`}
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closePending}
              className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitPending()}
              className="rounded-md bg-emerald-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Confirmation…' : 'Confirmer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
