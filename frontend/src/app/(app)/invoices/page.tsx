'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { InvoiceRow } from '@/components/invoices/InvoiceRow';
import { InvoiceCard } from '@/components/invoices/InvoiceCard';
import { InvoicesEmptyState } from '@/components/invoices/InvoicesEmptyState';
import { StatCard } from '@/components/dashboard/StatCard';
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { ViewToggle, type ListViewMode } from '@/components/ui/ViewToggle';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { formatPrice, formatDate } from '@/lib/utils';
import type { InvoiceStatus, InvoiceDocType } from '@/lib/constants';

const VIEW_STORAGE_KEY = 'freelo-invoices-view';

interface InvoiceApiRow {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  dueDate: string | null;
  client: { id: string; name: string };
}

const TAB_LABELS: Record<string, string> = {
  all: 'Tous',
  INVOICE: 'Factures',
  QUOTE: 'Devis',
  PAID: 'Payées',
  OVERDUE: 'En retard',
};

export default function InvoicesPage() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const [activeTab, setActiveTab] = useState('all');
  const [viewMode, setViewMode] = useState<ListViewMode>('list');
  const { data, loading, error, refresh } = useApi<{ items: InvoiceApiRow[] }>(
    '/api/invoices?limit=50',
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
  const hidePaidByDefault = user.showPaidInvoicesDefault === false;
  const allTabItems = hidePaidByDefault ? items.filter((i) => i.status !== 'PAID') : items;
  const filtered =
    activeTab === 'all'
      ? allTabItems
      : items.filter((i) => i.docType === activeTab || i.status === activeTab);
  const tabs: FilterTab[] = Object.entries(TAB_LABELS).map(([key, label]) => ({
    key,
    label,
    count:
      key === 'all'
        ? allTabItems.length
        : items.filter((i) => i.docType === key || i.status === key).length,
  }));

  const totalPaid = items.filter((i) => i.status === 'PAID').reduce((sum, i) => sum + i.amount, 0);
  const totalPending = items
    .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
            Devis &amp; Factures
          </h1>
          <p className="font-body text-sm text-muted-foreground">
            Gérez vos devis et factures en un seul endroit.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => openCreate('quote')}
            className="flex flex-shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground"
          >
            <Icon i="plus" size={16} />
            <span className="hidden sm:inline">Nouveau</span>
          </button>
        )}
      </div>

      {!loading && !error && items.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            label="Encaissé"
            value={formatPrice(totalPaid)}
            unit="XOF"
            icon="check-circle"
          />
          <StatCard
            label="En attente"
            value={formatPrice(totalPending)}
            unit="XOF"
            icon="file-clock"
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
            items.length === 0 ? (
              <InvoicesEmptyState onCreate={() => openCreate('quote')} />
            ) : (
              <EmptyState
                icon="filter"
                title="Aucun résultat"
                description="Aucun document ne correspond à ce filtre."
              />
            )
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((i) => (
                <InvoiceCard
                  key={i.id}
                  invoice={{
                    id: i.id,
                    number: i.number,
                    docType: i.docType,
                    status: i.status,
                    clientName: i.client.name,
                    amount: i.amount,
                    currency: i.currency,
                    dueDateLabel: i.dueDate ? formatDate(i.dueDate) : null,
                  }}
                />
              ))}
            </div>
          ) : (
            <div>
              {filtered.map((i) => (
                <InvoiceRow
                  key={i.id}
                  invoice={{
                    id: i.id,
                    number: i.number,
                    docType: i.docType,
                    status: i.status,
                    clientName: i.client.name,
                    amount: i.amount,
                    currency: i.currency,
                    dueDateLabel: i.dueDate ? formatDate(i.dueDate) : null,
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
