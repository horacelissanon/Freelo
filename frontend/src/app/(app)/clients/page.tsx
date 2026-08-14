'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { ClientRow } from '@/components/clients/ClientRow';
import { ClientCard } from '@/components/clients/ClientCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { ViewToggle, type ListViewMode } from '@/components/ui/ViewToggle';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import type { ClientStatus } from '@/lib/constants';

const VIEW_STORAGE_KEY = 'freelo-clients-view';

interface ClientApiRow {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: ClientStatus;
  _count: { projects: number };
}

const TAB_LABELS: Record<string, string> = {
  all: 'Tous',
  active: 'Actifs',
  pending: 'En attente',
  archived: 'Archivés',
};

export default function ClientsPage() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const [activeTab, setActiveTab] = useState('all');
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
  const filtered = activeTab === 'all' ? items : items.filter((c) => c.status === activeTab);
  const tabs: FilterTab[] = Object.entries(TAB_LABELS).map(([key, label]) => ({
    key,
    label,
    count: key === 'all' ? items.length : items.filter((c) => c.status === key).length,
  }));

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
            label="Clients actifs"
            value={String(items.filter((c) => c.status === 'active').length)}
            icon="briefcase"
          />
        </div>
      )}

      <div className="rounded-lg border border-border bg-canvas shadow-card">
        <div className="flex items-center gap-2 px-5 pt-2">
          <div className="min-w-0 flex-1">
            <FilterTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
          </div>
          <ViewToggle value={viewMode} onChange={changeView} />
        </div>
        <div className="p-5">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="users"
              title="Aucun client"
              description="Les clients que vous ajoutez apparaîtront ici."
            />
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
            <div>
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
      </div>
    </div>
  );
}
