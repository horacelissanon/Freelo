'use client';

import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
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
  mrrTrendDelta: number | null;
  churnRate: number;
  dau: number;
  revenueTrend: { label: string; amount: number }[];
  systemHealth: {
    outboxPending: number;
    outboxDead: number;
    emailPending: number;
    emailDead: number;
    lockoutCount: number;
    openAlertsCount: number;
    criticalAlertsCount: number;
  };
  support: { openTickets: number; urgentOpenTickets: number };
  recentUsers: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    accountStatus: string;
    plan: 'FREE' | 'PRO';
    createdAt: string;
  }[];
  recentFailedPayments: {
    id: string;
    amount: number;
    currency: string;
    provider: string;
    createdAt: string;
    user: { email: string; name: string | null };
  }[];
}

interface RecentTicket {
  id: string;
  subject: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  user: { email: string; name: string | null };
}

const cardClass = 'rounded-xl border border-border bg-canvas p-5 shadow-card';

const PRIORITY_LABELS: Record<RecentTicket['priority'], string> = {
  LOW: 'Basse',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
};
const PRIORITY_COLORS: Record<RecentTicket['priority'], string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-tag-orange text-tag-orange-fg',
  HIGH: 'bg-tag-red text-tag-red-fg',
};
const TICKET_STATUS_LABELS: Record<RecentTicket['status'], string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
};
const TICKET_STATUS_COLORS: Record<RecentTicket['status'], string> = {
  OPEN: 'bg-tag-red text-tag-red-fg',
  IN_PROGRESS: 'bg-tag-orange text-tag-orange-fg',
  RESOLVED: 'bg-tag-green text-tag-green-fg',
};

function Trend({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return null;
  const positive = invert ? value <= 0 : value >= 0;
  return (
    <p
      className={`mt-1 flex items-center gap-1 font-body text-xs font-medium ${
        positive ? 'text-emerald-600' : 'text-red-600'
      }`}
    >
      <Icon i={value >= 0 ? 'trending-up' : 'trending-down'} size={12} />
      {value >= 0 ? '+' : ''}
      {value}% ce mois
    </p>
  );
}

function StatCard({
  label,
  value,
  icon,
  children,
}: {
  label: string;
  value: string;
  icon: string;
  children?: ReactNode;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-body text-xs text-muted-foreground">{label}</span>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50">
          <Icon i={icon} size={15} className="text-emerald-600" />
        </div>
      </div>
      <p className="mt-2 font-headings text-2xl font-bold text-foreground">{value}</p>
      {children}
    </div>
  );
}

// Mirrors the real layout below (4 stat cards, MRR chart + plan split,
// 2 list cards, tickets, system health) instead of generic placeholder
// boxes, so nothing reflows into a visibly different shape once data
// arrives — same intent as PageStates.tsx's LoadingState, just tailored to
// this page's specific grid since a 3-item list skeleton wouldn't fit it.
function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cardClass}>
            <div className="flex items-start justify-between gap-2">
              <Pulse className="h-3 w-20" />
              <Pulse className="h-8 w-8 rounded-lg" />
            </div>
            <Pulse className="mt-3 h-6 w-16" />
          </div>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${cardClass} lg:col-span-2`}>
          <Pulse className="mb-4 h-4 w-40" />
          <Pulse className="h-40 w-full rounded-lg" />
        </div>
        <div className={cardClass}>
          <Pulse className="mb-4 h-4 w-32" />
          <Pulse className="h-3 w-full rounded-full" />
          <div className="mt-3 flex flex-col gap-2.5">
            <Pulse className="h-4 w-full" />
            <Pulse className="h-4 w-full" />
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={cardClass}>
            <Pulse className="mb-4 h-4 w-44" />
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((row) => (
                <Pulse key={row} className="h-10 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={`${cardClass} mb-4`}>
        <Pulse className="mb-4 h-4 w-40" />
        <div className="flex flex-col gap-3">
          {[0, 1].map((row) => (
            <Pulse key={row} className="h-10 w-full" />
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <Pulse className="mb-3 h-4 w-32" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((row) => (
            <Pulse key={row} className="h-6 w-full" />
          ))}
        </div>
      </div>
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
        <span className="font-body text-sm text-foreground">{label}</span>
      </div>
      <span
        className={`font-body text-xs font-medium ${ok ? 'text-emerald-600' : 'text-amber-600'}`}
      >
        {detail}
      </span>
    </div>
  );
}

// Pure-SVG line + area chart — no charting dependency. `points` are already
// normalized month buckets; we just map them into a 0..100 viewBox.
function MrrChart({
  points,
  currency,
}: {
  points: { label: string; amount: number }[];
  currency: string;
}) {
  const width = 600;
  const height = 160;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.amount));
  const stepX = width / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => ({
    x: i * stepX,
    y: height - (p.amount / max) * (height - 20) - 10,
    ...p,
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  // No hover → default to the latest point, so the card always leads with
  // an at-a-glance current value instead of an empty header.
  const lastIdx = coords.length - 1;
  const activeIdx = hoverIdx ?? lastIdx;
  const active = coords[activeIdx];

  function handleMove(e: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || coords.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const x = fraction * width;
    let nearest = 0;
    let nearestDist = Infinity;
    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - x);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="font-headings text-sm font-semibold text-foreground">MRR — 6 derniers mois</p>
        {active && (
          <div className="text-right">
            <p className="font-headings text-lg leading-tight font-bold text-emerald-600">
              {formatPrice(active.amount, currency)}
            </p>
            <p className="font-body text-[11px] text-muted-foreground capitalize">
              {active.label}
              {hoverIdx === null ? ' · dernier mois' : ''}
            </p>
          </div>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full cursor-crosshair overflow-visible"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="mrr-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#mrr-area)" />
        <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2.5" />
        {active && (
          <line
            x1={active.x}
            y1={0}
            x2={active.x}
            y2={height}
            stroke="#10b981"
            strokeOpacity="0.3"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}
        {coords.map((c, i) => (
          <circle
            key={c.label}
            cx={c.x}
            cy={c.y}
            r={i === activeIdx ? 6 : 4}
            fill="#10b981"
            stroke="#fff"
            strokeWidth={i === activeIdx ? 2 : 0}
          />
        ))}
      </svg>
      <div className="mt-2 flex justify-between">
        {points.map((p, i) => (
          <span
            key={p.label}
            className={`font-body text-xs capitalize ${
              i === activeIdx ? 'font-semibold text-emerald-600' : 'text-muted-foreground'
            }`}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApi<OverviewResponse>('/api/admin/overview');
  const { data: recentTickets, loading: ticketsLoading } = useApi<{ items: RecentTicket[] }>(
    '/api/admin/support-tickets?limit=5',
  );

  const totalPlans = data ? Math.max(1, data.planDistribution.free + data.planDistribution.pro) : 1;

  return (
    <div>
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-6 text-white shadow-lg">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-body text-[11px] font-semibold tracking-wide uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Console Admin
        </span>
        <h1 className="mt-3 font-headings text-2xl font-bold">Pilotage de la plateforme</h1>
        <p className="mt-1 font-body text-sm text-white/60">
          {data
            ? `${data.totalUsers} comptes · ${formatPrice(data.mrr, data.mrrCurrency)} de MRR ce mois-ci`
            : `Connecté en tant que ${user?.email}`}
        </p>
      </div>

      {loading ? (
        <OverviewSkeleton />
      ) : error || !data ? (
        <div className={`${cardClass} text-center`}>
          <p className="font-body text-sm text-muted-foreground">
            {error ?? 'Impossible de charger les données.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="MRR ce mois-ci"
              value={formatPrice(data.mrr, data.mrrCurrency)}
              icon="banknote"
            >
              <Trend value={data.mrrTrendDelta} />
            </StatCard>
            <StatCard label="Comptes actifs" value={String(data.totalUsers)} icon="users">
              {data.newUsersThisMonth > 0 && (
                <p className="mt-1 font-body text-xs font-medium text-emerald-600">
                  +{data.newUsersThisMonth} ce mois
                </p>
              )}
            </StatCard>
            <StatCard label="Taux de churn" value={`${data.churnRate}%`} icon="trending-down">
              <Trend value={data.churnRate} invert />
            </StatCard>
            <StatCard
              label="Tickets support ouverts"
              value={String(data.support.openTickets)}
              icon="message-circle"
            >
              {data.support.urgentOpenTickets > 0 && (
                <p className="mt-1 font-body text-xs font-medium text-red-600">
                  dont {data.support.urgentOpenTickets} urgent
                  {data.support.urgentOpenTickets !== 1 ? 's' : ''}
                </p>
              )}
            </StatCard>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={`${cardClass} lg:col-span-2`}>
              <MrrChart points={data.revenueTrend} currency={data.mrrCurrency} />
            </div>

            <div className={cardClass}>
              <p className="mb-3 font-headings text-sm font-semibold text-foreground">
                Répartition des plans
              </p>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-slate-400"
                  style={{ width: `${(data.planDistribution.free / totalPlans) * 100}%` }}
                />
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                  style={{ width: `${(data.planDistribution.pro / totalPlans) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between font-body text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Gratuit
                  </span>
                  <span className="font-medium text-foreground">{data.planDistribution.free}</span>
                </div>
                <div className="flex items-center justify-between font-body text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Pro
                  </span>
                  <span className="font-medium text-foreground">{data.planDistribution.pro}</span>
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
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={cardClass}>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-headings text-sm font-semibold text-foreground">
                  Derniers comptes inscrits
                </p>
                <Link
                  href="/admin/users"
                  className="font-body text-xs font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Tout voir
                </Link>
              </div>
              {data.recentUsers.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">
                  Aucun utilisateur pour l&apos;instant.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {data.recentUsers.map((u) => {
                    // Two distinct badges on purpose — Plan (Gratuit/Pro) and
                    // Statut (Actif/Suspendu) are independent axes, don't fold
                    // one into the other or a Free+Active row reads as a
                    // confusing "Gratuit / Gratuit" duplicate.
                    const statusLabel = u.accountStatus === 'SUSPENDED' ? 'Suspendu' : 'Actif';
                    const statusColor =
                      u.accountStatus === 'SUSPENDED'
                        ? 'bg-tag-red text-tag-red-fg'
                        : 'bg-tag-green text-tag-green-fg';
                    return (
                      <div key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-body text-sm font-medium text-foreground">
                            {u.name || u.email}
                          </p>
                          <p className="truncate font-body text-xs text-muted-foreground">
                            {formatLongDate(u.createdAt)}
                          </p>
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-muted px-2.5 py-1 font-body text-xs font-medium text-foreground">
                          {u.plan === 'PRO' ? 'Pro' : 'Gratuit'}
                        </span>
                        <span
                          className={`flex-shrink-0 rounded-full px-2.5 py-1 font-body text-xs font-medium ${statusColor}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={cardClass}>
              <p className="mb-3 font-headings text-sm font-semibold text-foreground">
                Paiements en échec récents
              </p>
              {data.recentFailedPayments.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">
                  Aucun paiement en échec récemment.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {data.recentFailedPayments.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-2.5">
                      <Icon i="alert-circle" size={16} className="flex-shrink-0 text-red-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-body text-sm font-medium text-foreground">
                          {p.user.name || p.user.email} — {formatPrice(p.amount, p.currency)}
                        </p>
                        <p className="truncate font-body text-xs text-muted-foreground">
                          {p.provider} · {formatLongDate(p.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link
                href="/admin/transactions"
                className="mt-3 flex items-center gap-1.5 font-body text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Voir la facturation
                <Icon i="chevron-right" size={12} />
              </Link>
            </div>
          </div>

          <div className={cardClass}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-headings text-sm font-semibold text-foreground">
                Tickets support récents
              </p>
              <Link
                href="/admin/support"
                className="font-body text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Tout voir
              </Link>
            </div>
            {ticketsLoading ? (
              <div className="flex flex-col gap-3">
                {[0, 1].map((row) => (
                  <Pulse key={row} className="h-10 w-full" />
                ))}
              </div>
            ) : !recentTickets || recentTickets.items.length === 0 ? (
              <p className="font-body text-sm text-muted-foreground">
                Aucun ticket pour l&apos;instant.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {recentTickets.items.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-body text-sm font-medium text-foreground">
                        {t.subject}
                      </p>
                      <p className="truncate font-body text-xs text-muted-foreground">
                        {t.user.name || t.user.email}
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 rounded-full px-2.5 py-1 font-body text-xs font-medium ${PRIORITY_COLORS[t.priority]}`}
                    >
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                    <span
                      className={`flex-shrink-0 rounded-full px-2.5 py-1 font-body text-xs font-medium ${TICKET_STATUS_COLORS[t.status]}`}
                    >
                      {TICKET_STATUS_LABELS[t.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${cardClass} mt-4`}>
            <p className="mb-1 font-headings text-sm font-semibold text-foreground">
              État du système
            </p>
            <div className="divide-y divide-border">
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
              <HealthRow
                label="Alertes plateforme"
                ok={data.systemHealth.criticalAlertsCount === 0}
                detail={
                  data.systemHealth.openAlertsCount > 0
                    ? `${data.systemHealth.openAlertsCount} ouverte(s)${
                        data.systemHealth.criticalAlertsCount > 0
                          ? ` dont ${data.systemHealth.criticalAlertsCount} critique(s)`
                          : ''
                      }`
                    : 'Aucune'
                }
              />
            </div>
            <Link
              href="/admin/alerts"
              className="mt-3 flex items-center gap-1.5 font-body text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              Voir le détail
              <Icon i="chevron-right" size={12} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
