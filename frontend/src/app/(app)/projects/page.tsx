'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useDisplayCurrency } from '@/contexts/DisplayCurrencyContext';
import { useMoneyMask } from '@/contexts/MoneyMaskContext';
import { useApi } from '@/lib/useApi';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { ProjectRow } from '@/components/dashboard/ProjectRow';
import { StatCard } from '@/components/dashboard/StatCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { ViewToggle, type ListViewMode } from '@/components/ui/ViewToggle';
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs';
import { DateFilterBar } from '@/components/ui/DateFilterBar';
import { ExportButtons } from '@/components/ui/ExportButtons';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { formatPrice, formatDate } from '@/lib/utils';
import { sumForDisplay } from '@/lib/displayAmount';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, type ProjectStatus } from '@/lib/constants';
import type { ProjectType } from '@/lib/constants';
import { DEFAULT_DATE_FILTER, isWithinDateFilter, type DateFilterValue } from '@/lib/dateFilter';

interface ProjectApiRow {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  progress: number;
  amount: number;
  currency: string;
  exchangeRateToDefault: number | null;
  step: string | null;
  dueDate: string | null;
  publicToken: string;
  createdAt: string;
  client: { id: string; name: string };
  deposit: { amount: number; paid: boolean };
  balance: { amount: number; paid: boolean };
}

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

const VIEW_STORAGE_KEY = 'zefacto-projects-view';

export default function ProjectsPage() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const { displayCurrency } = useDisplayCurrency();
  const { moneyMasked } = useMoneyMask();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  const [viewMode, setViewMode] = useState<ListViewMode>('list');
  const { data, loading, error, refresh } = useApi<{ items: ProjectApiRow[] }>(
    '/api/projects?limit=50',
  );
  const { data: fx } = useApi<{ XOF: number; EUR: number; USD: number }>('/api/fx-rates');
  const liveRates = fx ? { XOF: fx.XOF, EUR: fx.EUR, USD: fx.USD } : null;

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'list' || stored === 'grid') setViewMode(stored);
  }, []);

  function changeView(mode: ListViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  if (!user) return null;

  const items = data?.items ?? [];

  // The date filter scopes the cadrans too (not just the list below) so a
  // freelance can see "how much this month" at a glance — status tab counts
  // reflect that same date scope, while status itself obviously isn't
  // re-applied to its own tab counts.
  const dateScoped = items.filter((p) => isWithinDateFilter(p.createdAt, dateFilter));

  const statusTabs: FilterTab[] = [
    { key: 'all', label: 'Tout', count: dateScoped.length },
    ...(Object.entries(PROJECT_STATUS_LABELS) as [ProjectStatus, string][]).map(
      ([value, label]) => ({
        key: value,
        label,
        count: dateScoped.filter((p) => p.status === value).length,
      }),
    ),
  ];

  const scoped = dateScoped.filter((p) => statusFilter === 'all' || p.status === statusFilter);

  const searchQuery = search.trim().toLowerCase();
  const filtered = scoped
    .filter((p) => {
      if (!searchQuery) return true;
      return (
        p.name.toLowerCase().includes(searchQuery) ||
        p.client.name.toLowerCase().includes(searchQuery) ||
        PROJECT_TYPE_LABELS[p.type].toLowerCase().includes(searchQuery)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Brouillons aren't a real commitment yet (see ProjectForm's Enregistrer
  // brouillon / Créer projet split) — excluded from every card below so a
  // freelance's totals never include speculative, not-yet-sent projects.
  // Still fully visible/filterable in the list underneath via "Brouillon" in
  // the status filter.
  const realItems = scoped.filter((p) => p.status !== 'DRAFT');
  // Converted per project via its own frozen exchangeRateToDefault (or the
  // live cache for legacy rows) before summing into defaultCurrency
  // (stable), then re-displayed in whichever currency the global switcher
  // has picked — a raw reduce would mix XOF/EUR/USD amounts together into a
  // meaningless number.
  const defaultCurrency = user.defaultCurrency;
  const totalAmount = sumForDisplay(realItems, defaultCurrency, displayCurrency, liveRates);
  // "Actifs" mirrors the exact semantic already used app-wide (dashboard's
  // activeProjects, the free-plan project cap): anything not yet delivered.
  const activeCount = realItems.filter((p) => p.status !== 'DELIVERED').length;
  const depositsPending = sumForDisplay(
    realItems.map((p) => ({
      amount: p.deposit.paid ? 0 : p.deposit.amount,
      currency: p.currency,
      exchangeRateToDefault: p.exchangeRateToDefault,
    })),
    defaultCurrency,
    displayCurrency,
    liveRates,
  );
  const balancesPending = sumForDisplay(
    realItems.map((p) => ({
      amount: p.balance.paid ? 0 : p.balance.amount,
      currency: p.currency,
      exchangeRateToDefault: p.exchangeRateToDefault,
    })),
    defaultCurrency,
    displayCurrency,
    liveRates,
  );
  const collectedAmount = sumForDisplay(
    realItems.map((p) => ({
      amount: (p.deposit.paid ? p.deposit.amount : 0) + (p.balance.paid ? p.balance.amount : 0),
      currency: p.currency,
      exchangeRateToDefault: p.exchangeRateToDefault,
    })),
    defaultCurrency,
    displayCurrency,
    liveRates,
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">Projets</h1>
          <p className="font-body text-sm text-muted-foreground">
            {realItems.length} projet{realItems.length !== 1 ? 's' : ''} en cours et terminés
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate('project')}
          className="flex flex-shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground"
        >
          <Icon i="plus" size={16} />
          <span className="hidden sm:inline">Nouveau projet</span>
        </button>
      </div>

      {!loading && !error && items.length > 0 && (
        <div className="mb-6">
          <FilterTabs tabs={statusTabs} active={statusFilter} onChange={setStatusFilter} />
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="mb-6">
          <DateFilterBar value={dateFilter} onChange={setDateFilter} />
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            label="Valeur totale"
            value={formatPrice(totalAmount)}
            unit={displayCurrency}
            icon="banknote"
            masked={moneyMasked}
          />
          <StatCard
            label="Chiffre d'affaires total"
            value={formatPrice(collectedAmount)}
            unit={displayCurrency}
            icon="wallet"
            masked={moneyMasked}
          />
          <StatCard
            label="Acomptes en attente"
            value={formatPrice(depositsPending)}
            unit={displayCurrency}
            icon="file-clock"
            masked={moneyMasked}
          />
          <StatCard
            label="Soldes en attente"
            value={formatPrice(balancesPending)}
            unit={displayCurrency}
            icon="file-clock"
            masked={moneyMasked}
          />
          <StatCard label="Total projets" value={String(realItems.length)} icon="folder-open" />
          <StatCard label="Projets actifs" value={String(activeCount)} icon="clock" />
        </div>
      )}

      <div className="mb-6 flex gap-2 rounded-lg border border-border bg-canvas shadow-card p-4">
        <div className="relative min-w-0 flex-1">
          <Icon
            i="search"
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Rechercher un projet (titre, client, type)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <ViewToggle value={viewMode} onChange={changeView} />
        <ExportButtons
          filename="projets"
          title="Projets"
          subtitle={`${filtered.length} projet${filtered.length !== 1 ? 's' : ''}`}
          columns={[
            { header: 'Nom', width: 2, value: (p: ProjectApiRow) => p.name },
            { header: 'Client', width: 2, value: (p: ProjectApiRow) => p.client.name },
            {
              header: 'Type',
              width: 1.5,
              value: (p: ProjectApiRow) => PROJECT_TYPE_LABELS[p.type],
            },
            {
              header: 'Statut',
              width: 1,
              value: (p: ProjectApiRow) => PROJECT_STATUS_LABELS[p.status],
            },
            { header: 'Avancement', width: 1, value: (p: ProjectApiRow) => `${p.progress}%` },
            {
              header: 'Montant',
              width: 1,
              value: (p: ProjectApiRow) => `${p.amount} ${p.currency}`,
            },
            {
              header: 'Échéance',
              width: 1,
              value: (p: ProjectApiRow) => (p.dueDate ? formatDate(p.dueDate) : ''),
            },
          ]}
          rows={filtered}
        />
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon="folder-open"
            title="Aucun projet"
            description="Les projets que vous créez apparaîtront ici."
          />
        ) : (
          <EmptyState
            icon="filter"
            title="Aucun résultat"
            description="Aucun projet ne correspond à cette recherche."
          />
        )
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={{
                id: p.id,
                name: p.name,
                type: p.type,
                status: p.status,
                progress: p.progress,
                amount: p.amount,
                currency: p.currency,
                dueDate: p.dueDate,
                dueDateLabel: p.dueDate ? formatDate(p.dueDate) : null,
                publicToken: p.publicToken,
                clientName: p.client.name,
                deposit: p.deposit,
                balance: p.balance,
              }}
              masked={moneyMasked}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
          {filtered.map((p, i) => (
            <ProjectRow
              key={p.id}
              index={i}
              masked={moneyMasked}
              project={{
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
                clientName: p.client.name,
                deposit: p.deposit,
                balance: p.balance,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
