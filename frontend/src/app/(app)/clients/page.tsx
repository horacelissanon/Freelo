'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { ClientRow } from '@/components/clients/ClientRow';
import { ClientCard } from '@/components/clients/ClientCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { ViewToggle, type ListViewMode } from '@/components/ui/ViewToggle';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { CLIENT_STATUS_LABELS, type ClientStatus } from '@/lib/constants';

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

type SortKey = 'recent' | 'oldest' | 'name_asc' | 'name_desc' | 'projects_desc';

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Plus récent',
  oldest: 'Plus ancien',
  name_asc: 'Nom A → Z',
  name_desc: 'Nom Z → A',
  projects_desc: 'Plus de projets',
};

export default function ClientsPage() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [viewMode, setViewMode] = useState<ListViewMode>('list');
  const { data, loading, error, refresh } = useApi<{ items: ClientApiRow[] }>(
    '/api/clients?limit=50',
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = items.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.contactName ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
      );
    });
    const sorted = [...rows];
    switch (sortBy) {
      case 'oldest':
        sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name_desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'projects_desc':
        sorted.sort((a, b) => b._count.projects - a._count.projects);
        break;
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
  }, [items, search, statusFilter, sortBy]);

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
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard label="Total clients" value={String(items.length)} icon="users" />
          <StatCard
            label="Avec un projet actif"
            value={String(items.filter((c) => c.projects.length > 0).length)}
            icon="briefcase"
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
              placeholder="Rechercher un client (nom, entreprise, contact)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} w-full pl-9`}
            />
          </div>
          <ViewToggle value={viewMode} onChange={changeView} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputClass}
          >
            <option value="all">Tous les statuts</option>
            {(Object.entries(CLIENT_STATUS_LABELS) as [ClientStatus, string][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
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
              }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
          {filtered.map((c) => (
            <ClientRow
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
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
