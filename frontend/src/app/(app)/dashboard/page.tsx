'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { api } from '@/lib/api';
import { StatCard } from '@/components/dashboard/StatCard';
import { ProjectRow, type ProjectRowData } from '@/components/dashboard/ProjectRow';
import { AlertBanner } from '@/components/dashboard/AlertBanner';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import { UnpaidInvoicesPanel } from '@/components/dashboard/UnpaidInvoicesPanel';
import { RevenueTrendCard } from '@/components/dashboard/RevenueTrendCard';
import { UpcomingDeadlinesCard } from '@/components/dashboard/UpcomingDeadlinesCard';
import { Icon } from '@/components/ui/Icon';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatPrice, formatDate, formatLongDate } from '@/lib/utils';
import type { ProjectStatus, InvoiceStatus } from '@/lib/constants';

interface DashboardStats {
  revenue: { amount: number; currency: string; trendPercent: number | null };
  activeProjects: { count: number };
  pendingInvoices: { amount: number; currency: string; overdueCount: number };
  newClients: { count: number; trend: number };
  revenueTrend: { month: string; amount: number }[];
}

interface ProjectApiRow {
  id: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  amount: number;
  currency: string;
  step: string | null;
  dueDate: string | null;
  publicToken: string;
}

interface NotificationApiRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: { projectId?: string; invoiceId?: string } | null;
  readAt: string | null;
  createdAt: string;
}

interface InvoiceApiRow {
  id: string;
  number: string;
  docType: 'INVOICE' | 'QUOTE';
  status: InvoiceStatus;
  amount: number;
  client: { id: string; name: string };
}

const URGENT_WINDOW_DAYS = 7;
const MONEY_MASK_KEY = 'merrudit-dashboard-money-masked';

export default function DashboardPage() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const stats = useApi<DashboardStats>('/api/dashboard/stats');
  const projects = useApi<{ items: ProjectApiRow[] }>('/api/projects?status=ACTIVE&limit=5');
  const notifications = useApi<{ items: NotificationApiRow[] }>('/api/notifications?limit=8');
  const notifCount = useApi<{ count: number }>('/api/notifications/count');
  const invoices = useApi<{ items: InvoiceApiRow[] }>('/api/invoices?limit=50');

  // Per-device preference, not a server setting — same pattern as
  // sidebar-collapsed/bottom-nav-glass. Defaults to visible. The eye toggle
  // lives on the "Factures en attente" card (not "Revenus") but masks every
  // money figure on this page — both StatCards, the active-projects list,
  // the unpaid-invoices panel, the revenue trend chart's bar labels, and
  // the overdue-invoices alert banner.
  const [moneyMasked, setMoneyMasked] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(MONEY_MASK_KEY) === '1') setMoneyMasked(true);
    } catch {
      // Storage unavailable — stays visible for this session.
    }
  }, []);

  function toggleMoneyMasked() {
    setMoneyMasked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MONEY_MASK_KEY, next ? '1' : '0');
      } catch {
        // Preference still applies for this session, just won't persist.
      }
      return next;
    });
  }

  if (!user) return null;

  const firstName = user.name?.trim().split(/\s+/)[0] || user.email.split('@')[0];

  const projectRows: ProjectRowData[] = (projects.data?.items ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    progress: p.progress,
    amount: p.amount,
    currency: p.currency,
    step: p.step,
    dueDateLabel: p.dueDate ? formatDate(p.dueDate) : null,
    publicToken: p.publicToken,
  }));

  async function markAllNotificationsRead() {
    await api('/api/notifications', { method: 'PATCH', body: { ids: 'all' } });
    invalidateCachePrefix('/api/notifications');
  }

  async function markNotificationRead(id: string) {
    await api('/api/notifications', { method: 'PATCH', body: { ids: [id] } });
    invalidateCachePrefix('/api/notifications');
  }

  const unpaidInvoices = (invoices.data?.items ?? [])
    .filter((i) => i.docType === 'INVOICE' && (i.status === 'SENT' || i.status === 'OVERDUE'))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const UPCOMING_WINDOW_DAYS = 14;
  const upcomingDeadlines = (projects.data?.items ?? [])
    .filter((p) => p.dueDate)
    .map((p) => ({
      id: p.id,
      name: p.name,
      daysLeft: Math.ceil((new Date(p.dueDate as string).getTime() - Date.now()) / 86_400_000),
    }))
    .filter((p) => p.daysLeft >= 0 && p.daysLeft <= UPCOMING_WINDOW_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);

  // Data-honest alert: never fabricated. Overdue invoices win (money already
  // late); otherwise the soonest due in-progress project within the urgency
  // window; otherwise no banner at all.
  let alert: { text: string; href: string } | null = null;
  if (stats.data && stats.data.pendingInvoices.overdueCount > 0) {
    const n = stats.data.pendingInvoices.overdueCount;
    const amountText = moneyMasked
      ? ''
      : ` — ${formatPrice(stats.data.pendingInvoices.amount)} FCFA à encaisser`;
    alert = {
      text: `${n} facture${n > 1 ? 's' : ''} en retard${amountText}`,
      href: '/invoices',
    };
  } else {
    const soonest = (projects.data?.items ?? [])
      .filter((p) => p.dueDate)
      .map((p) => ({
        ...p,
        daysLeft: Math.ceil((new Date(p.dueDate as string).getTime() - Date.now()) / 86_400_000),
      }))
      .filter((p) => p.daysLeft >= 0 && p.daysLeft <= URGENT_WINDOW_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft)[0];
    if (soonest) {
      alert = {
        text: `${soonest.name} — échéance dans ${soonest.daysLeft === 0 ? "moins d'un jour" : `${soonest.daysLeft} jour${soonest.daysLeft > 1 ? 's' : ''}`}`,
        href: `/projects/${soonest.id}`,
      };
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
            Bonjour, {firstName}
          </h1>
          <p className="font-body text-sm text-muted-foreground capitalize">
            {formatLongDate(new Date())}
          </p>
        </div>
        {/* Desktop only — mobile gets the bell in the persistent top bar
            ((app)/layout.tsx) and relies on BottomNav's central "+" for
            quick creation. Quick-create actions live in the Client/Devis/
            Projet row below instead of a duplicate header button. */}
        <div className="hidden lg:flex lg:items-center lg:gap-3">
          <NotificationBell
            unreadCount={notifCount.data?.count ?? 0}
            notifications={notifications.data?.items ?? []}
            onMarkAllRead={() => void markAllNotificationsRead()}
            onMarkRead={(id) => void markNotificationRead(id)}
          />
        </div>
      </div>

      {alert && (
        <div className="mb-6">
          <AlertBanner text={alert.text} href={alert.href} />
        </div>
      )}

      {stats.loading ? (
        <LoadingState />
      ) : stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.refresh} />
      ) : stats.data ? (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="Chiffre d'affaires ce mois-ci"
            value={formatPrice(stats.data.revenue.amount)}
            unit={stats.data.revenue.currency}
            icon="banknote"
            trend={
              stats.data.revenue.trendPercent === null
                ? undefined
                : {
                    text: `${stats.data.revenue.trendPercent > 0 ? '+' : ''}${stats.data.revenue.trendPercent}%`,
                    up: stats.data.revenue.trendPercent >= 0,
                  }
            }
            masked={moneyMasked}
          />
          <StatCard
            label="Projets actifs"
            value={String(stats.data.activeProjects.count)}
            icon="briefcase"
          />
          <StatCard
            label="Factures en attente"
            value={formatPrice(stats.data.pendingInvoices.amount)}
            unit={stats.data.pendingInvoices.currency}
            icon="file-clock"
            trend={
              stats.data.pendingInvoices.overdueCount > 0
                ? { text: `${stats.data.pendingInvoices.overdueCount} en retard`, up: false }
                : undefined
            }
            masked={moneyMasked}
            onToggleMasked={toggleMoneyMasked}
          />
          <StatCard
            label="Nouveaux clients"
            value={String(stats.data.newClients.count)}
            unit="ce mois-ci"
            icon="users"
            trend={
              stats.data.newClients.trend === 0
                ? undefined
                : {
                    text: `${stats.data.newClients.trend > 0 ? '+' : ''}${stats.data.newClients.trend}`,
                    up: stats.data.newClients.trend >= 0,
                  }
            }
          />
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => openCreate('client')}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-canvas shadow-card px-4 py-3.5 font-body text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          <Icon i="users" size={16} className="text-primary" />
          Nouveau client
        </button>
        <button
          type="button"
          onClick={() => openCreate('quote')}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-canvas shadow-card px-4 py-3.5 font-body text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          <Icon i="file-plus" size={16} className="text-primary" />
          Nouveau devis
        </button>
        <button
          type="button"
          onClick={() => openCreate('project')}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-canvas shadow-card px-4 py-3.5 font-body text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          <Icon i="plus" size={16} className="text-primary" />
          Nouveau projet
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {stats.data && <RevenueTrendCard data={stats.data.revenueTrend} masked={moneyMasked} />}
        </div>

        <div className="flex flex-col gap-6">
          <UpcomingDeadlinesCard items={upcomingDeadlines} />

          {stats.data && (
            <UnpaidInvoicesPanel
              invoices={unpaidInvoices}
              total={stats.data.pendingInvoices.amount}
              masked={moneyMasked}
            />
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-canvas shadow-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-headings text-base font-semibold text-foreground">
            Projets en cours
          </h2>
          <Link href="/projects" className="font-body text-xs font-medium text-primary">
            Voir tous
          </Link>
        </div>
        {projects.loading ? (
          <LoadingState />
        ) : projects.error ? (
          <ErrorState message={projects.error} onRetry={projects.refresh} />
        ) : projectRows.length === 0 ? (
          <EmptyState
            icon="folder-open"
            title="Aucun projet en cours"
            description="Vos projets actifs apparaîtront ici."
          />
        ) : (
          <div>
            {projectRows.map((p) => (
              <ProjectRow key={p.id} project={p} masked={moneyMasked} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
