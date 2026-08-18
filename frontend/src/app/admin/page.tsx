'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { Icon } from '@/components/ui/Icon';
import { formatPrice, formatLongDate } from '@/lib/utils';

interface OverviewResponse {
  totalUsers: number;
  newUsersThisMonth: number;
  activeSubscribers: number;
  planDistribution: { free: number; pro: number };
  mrr: number;
  mrrCurrency: string;
  dau: number;
  revenueTrend: { label: string; amount: number }[];
  systemHealth: {
    outboxPending: number;
    outboxDead: number;
    emailPending: number;
    emailDead: number;
    lockoutCount: number;
  };
  recentUsers: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
  }[];
  recentFailedOrders: {
    id: string;
    customerEmail: string | null;
    amount: number;
    currency: string;
    createdAt: string;
  }[];
}

const cardClass = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

function StatCard({
  label,
  value,
  icon,
  trend,
}: {
  label: string;
  value: string;
  icon: string;
  trend?: string;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-body text-xs text-slate-500">{label}</span>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50">
          <Icon i={icon} size={15} className="text-emerald-600" />
        </div>
      </div>
      <p className="mt-2 font-headings text-2xl font-bold text-slate-900">{value}</p>
      {trend && <p className="mt-1 font-body text-xs font-medium text-emerald-600">{trend}</p>}
    </div>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className={`h-2 w-2 flex-shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
        <span className="font-body text-sm text-slate-700">{label}</span>
      </div>
      <span
        className={`font-body text-xs font-medium ${ok ? 'text-emerald-600' : 'text-amber-600'}`}
      >
        {detail}
      </span>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApi<OverviewResponse>('/api/admin/overview');

  const maxAmount = data ? Math.max(1, ...data.revenueTrend.map((m) => m.amount)) : 1;
  const totalPlans = data ? Math.max(1, data.planDistribution.free + data.planDistribution.pro) : 1;

  return (
    <div>
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-body text-[11px] font-semibold tracking-wide text-emerald-700 uppercase">
            Console Admin
          </span>
        </div>
        <h1 className="font-headings text-2xl font-bold text-slate-900">Vue d&apos;ensemble</h1>
        <p className="font-body text-sm text-slate-500">
          {data
            ? `${data.totalUsers} comptes · ${formatPrice(data.mrr, data.mrrCurrency)} de MRR ce mois-ci`
            : `Connecté en tant que ${user?.email}`}
        </p>
      </header>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : error || !data ? (
        <div className={`${cardClass} text-center`}>
          <p className="font-body text-sm text-slate-500">
            {error ?? 'Impossible de charger les données.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Utilisateurs totaux"
              value={String(data.totalUsers)}
              icon="users"
              {...(data.newUsersThisMonth > 0
                ? { trend: `+${data.newUsersThisMonth} ce mois` }
                : {})}
            />
            <StatCard
              label="MRR (revenu mensuel)"
              value={formatPrice(data.mrr, data.mrrCurrency)}
              icon="banknote"
            />
            <StatCard
              label="Abonnés Premium"
              value={String(data.activeSubscribers)}
              icon="credit-card"
            />
            <StatCard label="Utilisateurs actifs (24h)" value={String(data.dau)} icon="bar-chart" />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={`${cardClass} lg:col-span-2`}>
              <p className="mb-4 font-headings text-sm font-semibold text-slate-900">
                Croissance des revenus (MRR) — 6 derniers mois
              </p>
              <div className="flex h-40 items-end gap-3">
                {data.revenueTrend.map((m) => (
                  <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-32 w-full items-end">
                      <div
                        className="w-full rounded-t-md bg-emerald-500"
                        style={{ height: `${Math.max(4, (m.amount / maxAmount) * 100)}%` }}
                        title={formatPrice(m.amount, data.mrrCurrency)}
                      />
                    </div>
                    <span className="font-body text-xs text-slate-400 capitalize">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={cardClass}>
              <p className="mb-1 font-headings text-sm font-semibold text-slate-900">
                État du système
              </p>
              <div className="divide-y divide-slate-100">
                <HealthRow
                  label="File d'événements"
                  ok={data.systemHealth.outboxDead === 0}
                  detail={
                    data.systemHealth.outboxDead > 0
                      ? `${data.systemHealth.outboxDead} en échec`
                      : `${data.systemHealth.outboxPending} en attente`
                  }
                />
                <HealthRow
                  label="Envoi d'emails"
                  ok={data.systemHealth.emailDead === 0}
                  detail={
                    data.systemHealth.emailDead > 0
                      ? `${data.systemHealth.emailDead} en échec`
                      : `${data.systemHealth.emailPending} en attente`
                  }
                />
                <HealthRow
                  label="Verrous d'authentification"
                  ok={data.systemHealth.lockoutCount === 0}
                  detail={
                    data.systemHealth.lockoutCount > 0
                      ? `${data.systemHealth.lockoutCount} compte(s) verrouillé(s)`
                      : 'Aucun'
                  }
                />
              </div>
              <Link
                href="/admin/performance"
                className="mt-3 flex items-center gap-1.5 font-body text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Voir le détail
                <Icon i="chevron-right" size={12} />
              </Link>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={cardClass}>
              <p className="mb-3 font-headings text-sm font-semibold text-slate-900">
                Répartition des plans
              </p>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-slate-400"
                  style={{ width: `${(data.planDistribution.free / totalPlans) * 100}%` }}
                />
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${(data.planDistribution.pro / totalPlans) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between font-body text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Gratuit
                  </span>
                  <span className="font-medium text-slate-800">{data.planDistribution.free}</span>
                </div>
                <div className="flex items-center justify-between font-body text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Pro
                  </span>
                  <span className="font-medium text-slate-800">{data.planDistribution.pro}</span>
                </div>
              </div>
              <Link
                href="/admin/subscriptions"
                className="mt-3 flex items-center gap-1.5 font-body text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Voir les abonnements
                <Icon i="chevron-right" size={12} />
              </Link>
            </div>

            <div className={`${cardClass} lg:col-span-2`}>
              <p className="mb-3 font-headings text-sm font-semibold text-slate-900">
                Paiements en échec récents
              </p>
              {data.recentFailedOrders.length === 0 ? (
                <p className="font-body text-sm text-slate-400">
                  Aucun paiement en échec récemment.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.recentFailedOrders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-body text-sm font-medium text-slate-800">
                          {o.customerEmail || 'Client anonyme'}
                        </p>
                        <p className="truncate font-body text-xs text-slate-400">
                          {formatLongDate(o.createdAt)}
                        </p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-red-50 px-2.5 py-1 font-body text-xs font-medium text-red-700">
                        {formatPrice(o.amount, o.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Link
                href="/admin/transactions"
                className="mt-3 flex items-center gap-1.5 font-body text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Voir toutes les transactions
                <Icon i="chevron-right" size={12} />
              </Link>
            </div>
          </div>

          <div className={cardClass}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-headings text-sm font-semibold text-slate-900">
                Nouveaux utilisateurs récents
              </p>
              <Link
                href="/admin/users"
                className="font-body text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Voir tout
              </Link>
            </div>
            {data.recentUsers.length === 0 ? (
              <p className="font-body text-sm text-slate-400">
                Aucun utilisateur pour l&apos;instant.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-body text-sm font-medium text-slate-800">
                        {u.name || u.email}
                      </p>
                      <p className="truncate font-body text-xs text-slate-400">{u.email}</p>
                    </div>
                    <p className="flex-shrink-0 font-body text-xs text-slate-400">
                      {formatLongDate(u.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
