'use client';

import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { useDisplayCurrency } from '@/contexts/DisplayCurrencyContext';
import { useMoneyMask } from '@/contexts/MoneyMaskContext';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { api } from '@/lib/api';
import { displayAmount } from '@/lib/displayAmount';
import { StatCard } from '@/components/dashboard/StatCard';
import { ProjectRow, type ProjectRowData } from '@/components/dashboard/ProjectRow';
import { AlertBanner } from '@/components/dashboard/AlertBanner';
import { ProUpsellBanner } from '@/components/dashboard/ProUpsellBanner';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import { UnpaidInvoicesPanel } from '@/components/dashboard/UnpaidInvoicesPanel';
import { RevenueTrendCard } from '@/components/dashboard/RevenueTrendCard';
import { UpcomingDeadlinesCard } from '@/components/dashboard/UpcomingDeadlinesCard';
import { Icon } from '@/components/ui/Icon';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatPrice, formatDate, formatLongDate } from '@/lib/utils';
import type { ProjectStatus, InvoiceStatus } from '@/lib/constants';

interface DashboardStats {
  revenue: {
    amount: number;
    currency: string;
    amountsByCurrency: Record<string, number>;
    trendPercent: number | null;
  };
  activeProjects: { count: number };
  pendingInvoices: {
    amount: number;
    currency: string;
    amountsByCurrency: Record<string, number>;
    overdueCount: number;
  };
  newClients: { count: number; trend: number };
  revenueTrend: { month: string; amount: number; amountsByCurrency: Record<string, number> }[];
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

export default function DashboardPage() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const { displayCurrency } = useDisplayCurrency();
  const stats = useApi<DashboardStats>('/api/dashboard/stats');
  const projects = useApi<{ items: ProjectApiRow[] }>('/api/projects?status=ACTIVE&limit=5');
  const notifications = useApi<{ items: NotificationApiRow[] }>('/api/notifications?limit=8');
  const notifCount = useApi<{ count: number }>('/api/notifications/count');
  const invoices = useApi<{ items: InvoiceApiRow[] }>('/api/invoices?limit=50');
  const { data: fx } = useApi<{ XOF: number; EUR: number; USD: number }>('/api/fx-rates');
  const liveRates = fx ? { XOF: fx.XOF, EUR: fx.EUR, USD: fx.USD } : null;
  const { data: subscriptionData } = useApi<{ subscription: { isProActive: boolean } }>(
    '/api/billing/subscription',
  );
  const isProActive = subscriptionData?.subscription.isProActive ?? false;

  // Global currency-display switcher — recomputed from the same
  // amountDefault/amountsByCurrency pair the API already returns, never a
  // fresh fetch or a mutation of the underlying documents. See
  // lib/displayAmount.ts for why this equals amountDefault whenever
  // displayCurrency === the account's own default.
  const displayRevenue = stats.data
    ? displayAmount({
        amountDefault: stats.data.revenue.amount,
        amountsByCurrency: stats.data.revenue.amountsByCurrency,
        displayCurrency,
        defaultCurrency: stats.data.revenue.currency,
        liveRates,
      })
    : 0;
  const displayPendingInvoices = stats.data
    ? displayAmount({
        amountDefault: stats.data.pendingInvoices.amount,
        amountsByCurrency: stats.data.pendingInvoices.amountsByCurrency,
        displayCurrency,
        defaultCurrency: stats.data.pendingInvoices.currency,
        liveRates,
      })
    : 0;
  const statsData = stats.data;
  const displayRevenueTrend = statsData
    ? statsData.revenueTrend.map((point) => ({
        month: point.month,
        amount: displayAmount({
          amountDefault: point.amount,
          amountsByCurrency: point.amountsByCurrency,
          displayCurrency,
          defaultCurrency: statsData.revenue.currency,
          liveRates,
        }),
      }))
    : [];

  const { moneyMasked } = useMoneyMask();

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
    dueDate: p.dueDate,
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
    // No lower bound: an overdue project (negative daysLeft) needs this
    // surfaced more than an upcoming one, not silently dropped.
    .filter((p) => p.daysLeft <= UPCOMING_WINDOW_DAYS)
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
      : ` — ${formatPrice(displayPendingInvoices)} ${displayCurrency} à encaisser`;
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
      // No lower bound: an already-overdue project outranks any upcoming
      // one — it should win this banner slot, not be filtered out.
      .filter((p) => p.daysLeft <= URGENT_WINDOW_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft)[0];
    if (soonest) {
      const text =
        soonest.daysLeft < 0
          ? `${soonest.name} — échéance dépassée depuis ${Math.abs(soonest.daysLeft)} jour${Math.abs(soonest.daysLeft) > 1 ? 's' : ''}`
          : `${soonest.name} — échéance dans ${soonest.daysLeft === 0 ? "moins d'un jour" : `${soonest.daysLeft} jour${soonest.daysLeft > 1 ? 's' : ''}`}`;
      alert = { text, href: `/projects/${soonest.id}` };
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-col gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-[var(--color-primary)] p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-body text-[11px] font-semibold tracking-wide uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Tableau de bord
          </span>
          <h1 className="mt-3 font-headings text-2xl font-bold sm:text-3xl">
            Bonjour, {firstName}
          </h1>
          <p className="mt-1 font-body text-sm text-white/60">
            <span className="capitalize">{formatLongDate(new Date())}</span>
            {stats.data &&
              ` · ${stats.data.activeProjects.count} projet${stats.data.activeProjects.count > 1 ? 's' : ''} actif${stats.data.activeProjects.count > 1 ? 's' : ''}`}
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
            triggerClassName="bg-white/10 text-white hover:bg-white/20"
          />
        </div>
      </div>

      {alert && (
        <div className="mb-6">
          <AlertBanner text={alert.text} href={alert.href} />
        </div>
      )}

      {subscriptionData && !isProActive && (
        <div className="mb-6">
          <ProUpsellBanner />
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
            value={formatPrice(displayRevenue)}
            unit={displayCurrency}
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
            value={formatPrice(displayPendingInvoices)}
            unit={displayCurrency}
            icon="file-clock"
            trend={
              stats.data.pendingInvoices.overdueCount > 0
                ? { text: `${stats.data.pendingInvoices.overdueCount} en retard`, up: false }
                : undefined
            }
            masked={moneyMasked}
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

      <div className="mb-8 grid grid-cols-3 gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => openCreate('client')}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-canvas shadow-card px-2 py-3 font-body text-xs font-semibold text-foreground transition-colors hover:border-primary/40 sm:gap-2 sm:px-4 sm:py-3.5 sm:text-sm"
        >
          <Icon i="users" size={16} className="shrink-0 text-primary" />
          <span className="sm:hidden">Client</span>
          <span className="hidden sm:inline">Nouveau client</span>
        </button>
        <button
          type="button"
          onClick={() => openCreate('quote')}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-canvas shadow-card px-2 py-3 font-body text-xs font-semibold text-foreground transition-colors hover:border-primary/40 sm:gap-2 sm:px-4 sm:py-3.5 sm:text-sm"
        >
          <Icon i="file-plus" size={16} className="shrink-0 text-primary" />
          <span className="sm:hidden">Devis</span>
          <span className="hidden sm:inline">Nouveau devis</span>
        </button>
        <button
          type="button"
          onClick={() => openCreate('project')}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-canvas shadow-card px-2 py-3 font-body text-xs font-semibold text-foreground transition-colors hover:border-primary/40 sm:gap-2 sm:px-4 sm:py-3.5 sm:text-sm"
        >
          <Icon i="plus" size={16} className="shrink-0 text-primary" />
          <span className="sm:hidden">Projet</span>
          <span className="hidden sm:inline">Nouveau projet</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {stats.data && (
            <RevenueTrendCard
              data={displayRevenueTrend}
              masked={moneyMasked}
              unit={displayCurrency}
            />
          )}
        </div>

        <div className="flex h-full flex-col justify-center gap-6">
          <UpcomingDeadlinesCard items={upcomingDeadlines} />

          {stats.data && (
            <UnpaidInvoicesPanel
              invoices={unpaidInvoices}
              total={displayPendingInvoices}
              currency={displayCurrency}
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
