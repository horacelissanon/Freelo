'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { ProjectRow } from '@/components/dashboard/ProjectRow';
import { StatCard } from '@/components/dashboard/StatCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { ViewToggle, type ListViewMode } from '@/components/ui/ViewToggle';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { formatPrice, formatDate } from '@/lib/utils';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, type ProjectStatus } from '@/lib/constants';
import type { ProjectType } from '@/lib/constants';

interface ProjectApiRow {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  progress: number;
  amount: number;
  currency: string;
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

const VIEW_STORAGE_KEY = 'freelo-projects-view';

type SortKey = 'recent' | 'oldest' | 'amount_desc' | 'amount_asc';

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Plus récent',
  oldest: 'Plus ancien',
  amount_desc: 'Montant décroissant',
  amount_asc: 'Montant croissant',
};

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year ?? 2026, (month ?? 1) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    .replace(/^./, (c) => c.toUpperCase());
}

export default function ProjectsPage() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [viewMode, setViewMode] = useState<ListViewMode>('list');
  const { data, loading, error, refresh } = useApi<{ items: ProjectApiRow[] }>(
    '/api/projects?limit=50',
  );

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

  const monthOptions = useMemo(() => {
    const keys = new Set(items.filter((p) => p.dueDate).map((p) => monthKey(p.dueDate as string)));
    return Array.from(keys).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = items.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (monthFilter !== 'all' && (!p.dueDate || monthKey(p.dueDate) !== monthFilter))
        return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.client.name.toLowerCase().includes(q) ||
        PROJECT_TYPE_LABELS[p.type].toLowerCase().includes(q)
      );
    });
    const sorted = [...rows];
    switch (sortBy) {
      case 'oldest':
        sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case 'amount_desc':
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      case 'amount_asc':
        sorted.sort((a, b) => a.amount - b.amount);
        break;
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
  }, [items, search, statusFilter, monthFilter, sortBy]);

  const totalAmount = items.reduce((sum, p) => sum + p.amount, 0);
  const inProgressCount = items.filter((p) => p.status === 'IN_PROGRESS').length;
  const depositsPending = items.reduce(
    (sum, p) => sum + (p.deposit.paid ? 0 : p.deposit.amount),
    0,
  );
  const balancesPending = items.reduce(
    (sum, p) => sum + (p.balance.paid ? 0 : p.balance.amount),
    0,
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">Projets</h1>
          <p className="font-body text-sm text-muted-foreground">
            {items.length} projet{items.length !== 1 ? 's' : ''} en cours et terminés
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
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="col-span-2 sm:order-3 sm:col-span-1">
            <StatCard
              label="Valeur totale"
              value={formatPrice(totalAmount)}
              unit="XOF"
              icon="banknote"
            />
          </div>
          <div className="sm:order-1">
            <StatCard label="Total projets" value={String(items.length)} icon="folder-open" />
          </div>
          <div className="sm:order-2">
            <StatCard label="En cours" value={String(inProgressCount)} icon="clock" />
          </div>
          <StatCard
            label="Acomptes en attente"
            value={formatPrice(depositsPending)}
            unit="XOF"
            icon="file-clock"
          />
          <StatCard
            label="Soldes en attente"
            value={formatPrice(balancesPending)}
            unit="XOF"
            icon="file-clock"
          />
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-canvas shadow-card p-4">
        <div className="flex gap-2">
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
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${inputClass} col-span-2 sm:col-span-1`}
          >
            <option value="all">Tous les statuts</option>
            {(Object.entries(PROJECT_STATUS_LABELS) as [ProjectStatus, string][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className={inputClass}
          >
            <option value="all">Tous les mois</option>
            {monthOptions.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className={inputClass}
          >
            {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
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
                dueDateLabel: p.dueDate ? formatDate(p.dueDate) : null,
                publicToken: p.publicToken,
                clientName: p.client.name,
                deposit: p.deposit,
                balance: p.balance,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
          {filtered.map((p) => (
            <ProjectRow
              key={p.id}
              project={{
                id: p.id,
                name: p.name,
                status: p.status,
                progress: p.progress,
                amount: p.amount,
                currency: p.currency,
                step: p.step,
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
