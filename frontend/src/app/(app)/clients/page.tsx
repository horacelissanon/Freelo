'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useDisplayCurrency } from '@/contexts/DisplayCurrencyContext';
import { useMoneyMask } from '@/contexts/MoneyMaskContext';
import { useApi } from '@/lib/useApi';
import { displayAmount } from '@/lib/displayAmount';
import { ClientRow } from '@/components/clients/ClientRow';
import { ClientCard } from '@/components/clients/ClientCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { ViewToggle, type ListViewMode } from '@/components/ui/ViewToggle';
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs';
import { DateFilterBar } from '@/components/ui/DateFilterBar';
import { ExportButtons } from '@/components/ui/ExportButtons';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { formatPrice } from '@/lib/utils';
import { CLIENT_STATUS_LABELS, type ClientStatus } from '@/lib/constants';
import { DEFAULT_DATE_FILTER, isWithinDateFilter, type DateFilterValue } from '@/lib/dateFilter';

const VIEW_STORAGE_KEY = 'freelo-clients-view';

interface ClientApiRow {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: ClientStatus;
  createdAt: string;
  _count: { projects: number };
  /** Non-draft, non-delivered projects only — existence check, not a list to render. */
  projects: { id: string }[];
}

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

export default function ClientsPage() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const { displayCurrency } = useDisplayCurrency();
  const { moneyMasked } = useMoneyMask();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  const [viewMode, setViewMode] = useState<ListViewMode>('list');
  const { data, loading, error, refresh } = useApi<{
    items: ClientApiRow[];
    totalRevenue: number;
    totalRevenueCurrency: string;
    totalRevenueByCurrency: Record<string, number>;
  }>('/api/clients?limit=50');
  const { data: fx } = useApi<{ XOF: number; EUR: number; USD: number }>('/api/fx-rates');
  const liveRates = fx ? { XOF: fx.XOF, EUR: fx.EUR, USD: fx.USD } : null;
  const displayTotalRevenue = data
    ? displayAmount({
        amountDefault: data.totalRevenue,
        amountsByCurrency: data.totalRevenueByCurrency,
        displayCurrency,
        defaultCurrency: data.totalRevenueCurrency,
        liveRates,
      })
    : 0;

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

  // The date filter scopes the cadrans too (not just the list below), and
  // status tab counts follow that same date scope.
  const dateScoped = items.filter((c) => isWithinDateFilter(c.createdAt, dateFilter));

  const statusTabs: FilterTab[] = [
    { key: 'all', label: 'Tout', count: dateScoped.length },
    ...(Object.entries(CLIENT_STATUS_LABELS) as [ClientStatus, string][]).map(([value, label]) => ({
      key: value,
      label,
      count: dateScoped.filter((c) => c.status === value).length,
    })),
  ];

  const scoped = dateScoped.filter((c) => statusFilter === 'all' || c.status === statusFilter);

  const searchQuery = search.trim().toLowerCase();
  const filtered = scoped
    .filter((c) => {
      if (!searchQuery) return true;
      return (
        c.name.toLowerCase().includes(searchQuery) ||
        c.code.toLowerCase().includes(searchQuery) ||
        (c.company ?? '').toLowerCase().includes(searchQuery) ||
        (c.contactName ?? '').toLowerCase().includes(searchQuery) ||
        (c.email ?? '').toLowerCase().includes(searchQuery)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">Clients</h1>
          <p className="font-body text-sm text-muted-foreground">
            Retrouvez l&apos;ensemble de votre portefeuille clients.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate('client')}
          className="flex flex-shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground"
        >
          <Icon i="plus" size={16} />
          <span className="hidden sm:inline">Nouveau client</span>
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
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard label="Total clients" value={String(scoped.length)} icon="users" />
          <StatCard
            label="Avec un projet actif"
            value={String(scoped.filter((c) => c.projects.length > 0).length)}
            icon="briefcase"
          />
          <StatCard
            label="Chiffre d'affaires total"
            value={formatPrice(displayTotalRevenue)}
            unit={displayCurrency}
            icon="banknote"
            masked={moneyMasked}
          />
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
            placeholder="Rechercher un client (nom, entreprise, contact)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <ViewToggle value={viewMode} onChange={changeView} />
        <ExportButtons
          filename="clients"
          title="Clients"
          subtitle={`${filtered.length} client${filtered.length !== 1 ? 's' : ''}`}
          columns={[
            { header: 'Code', width: 1, value: (c: ClientApiRow) => c.code },
            { header: 'Nom', width: 2, value: (c: ClientApiRow) => c.name },
            { header: 'Contact', width: 2, value: (c: ClientApiRow) => c.contactName ?? '' },
            { header: 'Email', width: 2, value: (c: ClientApiRow) => c.email ?? '' },
            { header: 'Téléphone', width: 1.5, value: (c: ClientApiRow) => c.phone ?? '' },
            {
              header: 'Statut',
              width: 1,
              value: (c: ClientApiRow) => CLIENT_STATUS_LABELS[c.status],
            },
            {
              header: 'Projets',
              width: 1,
              value: (c: ClientApiRow) => String(c._count.projects),
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
            icon="users"
            title="Aucun client"
            description="Les clients que vous ajoutez apparaîtront ici."
          />
        ) : (
          <EmptyState
            icon="filter"
            title="Aucun résultat"
            description="Aucun client ne correspond à cette recherche."
          />
        )
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <ClientCard
              key={c.id}
              client={{
                id: c.id,
                code: c.code,
                name: c.name,
                contactName: c.contactName,
                email: c.email,
                phone: c.phone,
                status: c.status,
                projectCount: c._count.projects,
                activeProjectCount: c.projects.length,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
          {filtered.map((c, i) => (
            <ClientRow
              key={c.id}
              index={i}
              client={{
                id: c.id,
                code: c.code,
                name: c.name,
                contactName: c.contactName,
                email: c.email,
                phone: c.phone,
                status: c.status,
                projectCount: c._count.projects,
                activeProjectCount: c.projects.length,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
