'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { InvoiceRow } from '@/components/invoices/InvoiceRow';
import { InvoiceCard } from '@/components/invoices/InvoiceCard';
import { InvoicesEmptyState } from '@/components/invoices/InvoicesEmptyState';
import { StatCard } from '@/components/dashboard/StatCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { ViewToggle, type ListViewMode } from '@/components/ui/ViewToggle';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { formatPrice, formatDate } from '@/lib/utils';
import { INVOICE_STATUS_LABELS, type InvoiceStatus, type InvoiceDocType } from '@/lib/constants';

const VIEW_STORAGE_KEY = 'freelo-invoices-view';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

type SortKey = 'recent' | 'oldest' | 'amount_desc' | 'amount_asc';

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Plus récent',
  oldest: 'Plus ancien',
  amount_desc: 'Montant décroissant',
  amount_asc: 'Montant croissant',
};

// Devis never reach PAID/OVERDUE/CANCELED (those are invoice-lifecycle
// states) — each tab only offers the statuses that can actually occur on
// its own documents, per "un onglet bien séparé et adapté à chacun".
const FACTURE_STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELED'];
const DEVIS_STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'ACCEPTED'];

interface InvoiceApiRow {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  dueDate: string | null;
  createdAt: string;
  client: { id: string; name: string };
}

function sortRows(rows: InvoiceApiRow[], sortBy: SortKey): InvoiceApiRow[] {
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
}

function SearchFilterBar({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  statuses,
  sortBy,
  onSortBy,
  viewMode,
  onChangeView,
  placeholder,
}: {
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  statuses: InvoiceStatus[];
  sortBy: SortKey;
  onSortBy: (v: SortKey) => void;
  viewMode: ListViewMode;
  onChangeView: (v: ListViewMode) => void;
  placeholder: string;
}) {
  return (
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
            placeholder={placeholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <ViewToggle value={viewMode} onChange={onChangeView} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilter(e.target.value)}
          className={inputClass}
        >
          <option value="all">Tous les statuts</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {INVOICE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => onSortBy(e.target.value as SortKey)}
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
  );
}

function InvoiceList({
  items,
  viewMode,
  onCreateEmpty,
}: {
  items: InvoiceApiRow[];
  viewMode: ListViewMode;
  onCreateEmpty: () => void;
}) {
  if (items.length === 0) {
    return <InvoicesEmptyState onCreate={onCreateEmpty} />;
  }
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
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
    );
  }
  return (
    <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
      {items.map((i) => (
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
  );
}

function FacturesTab({
  rows,
  hidePaidByDefault,
  viewMode,
  onChangeView,
  onCreate,
}: {
  rows: InvoiceApiRow[];
  hidePaidByDefault: boolean;
  viewMode: ListViewMode;
  onChangeView: (v: ListViewMode) => void;
  onCreate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('recent');

  const filtered = useMemo(() => {
    const baseRows = hidePaidByDefault ? rows.filter((r) => r.status !== 'PAID') : rows;
    const q = search.trim().toLowerCase();
    const result = baseRows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.number.toLowerCase().includes(q) || r.client.name.toLowerCase().includes(q);
    });
    return sortRows(result, sortBy);
  }, [rows, hidePaidByDefault, search, statusFilter, sortBy]);

  const totalPaid = rows.filter((r) => r.status === 'PAID').reduce((sum, r) => sum + r.amount, 0);
  const totalPending = rows
    .filter((r) => r.status === 'SENT' || r.status === 'OVERDUE')
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <>
      {rows.length > 0 && (
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

      <SearchFilterBar
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        statuses={FACTURE_STATUSES}
        sortBy={sortBy}
        onSortBy={setSortBy}
        viewMode={viewMode}
        onChangeView={onChangeView}
        placeholder="Rechercher une facture (numéro, client)…"
      />

      {filtered.length === 0 && rows.length > 0 ? (
        <EmptyState
          icon="filter"
          title="Aucun résultat"
          description="Aucune facture ne correspond à ce filtre."
        />
      ) : (
        <InvoiceList items={filtered} viewMode={viewMode} onCreateEmpty={onCreate} />
      )}
    </>
  );
}

function DevisTab({
  rows,
  viewMode,
  onChangeView,
  onCreate,
}: {
  rows: InvoiceApiRow[];
  viewMode: ListViewMode;
  onChangeView: (v: ListViewMode) => void;
  onCreate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('recent');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.number.toLowerCase().includes(q) || r.client.name.toLowerCase().includes(q);
    });
    return sortRows(result, sortBy);
  }, [rows, search, statusFilter, sortBy]);

  const totalValue = rows.reduce((sum, r) => sum + r.amount, 0);
  const acceptedCount = rows.filter((r) => r.status === 'ACCEPTED').length;

  return (
    <>
      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            label="Valeur totale"
            value={formatPrice(totalValue)}
            unit="XOF"
            icon="file-text"
          />
          <StatCard label="Acceptés" value={String(acceptedCount)} icon="check-circle" />
        </div>
      )}

      <SearchFilterBar
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        statuses={DEVIS_STATUSES}
        sortBy={sortBy}
        onSortBy={setSortBy}
        viewMode={viewMode}
        onChangeView={onChangeView}
        placeholder="Rechercher un devis (numéro, client)…"
      />

      {filtered.length === 0 && rows.length > 0 ? (
        <EmptyState
          icon="filter"
          title="Aucun résultat"
          description="Aucun devis ne correspond à ce filtre."
        />
      ) : (
        <InvoiceList items={filtered} viewMode={viewMode} onCreateEmpty={onCreate} />
      )}
    </>
  );
}

export default function InvoicesPage() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const [activeTab, setActiveTab] = useState<'factures' | 'devis'>('factures');
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
  const factureRows = items.filter((i) => i.docType !== 'QUOTE');
  const devisRows = items.filter((i) => i.docType === 'QUOTE');

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
            onClick={() => openCreate(activeTab === 'devis' ? 'quote' : 'invoice')}
            className="flex flex-shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground"
          >
            <Icon i="plus" size={16} />
            <span className="hidden sm:inline">
              {activeTab === 'devis' ? 'Nouveau devis' : 'Nouvelle facture'}
            </span>
          </button>
        )}
      </div>

      <div className="mb-6 flex items-center gap-1 border-b border-border font-body">
        <button
          type="button"
          onClick={() => setActiveTab('factures')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'factures'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          <Icon i="file-text" size={15} />
          Factures
          {factureRows.length > 0 && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs">
              {factureRows.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('devis')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'devis'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          <Icon i="file-clock" size={15} />
          Devis
          {devisRows.length > 0 && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs">
              {devisRows.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : items.length === 0 ? (
        <InvoicesEmptyState onCreate={() => openCreate('quote')} />
      ) : activeTab === 'factures' ? (
        <FacturesTab
          rows={factureRows}
          hidePaidByDefault={user.showPaidInvoicesDefault === false}
          viewMode={viewMode}
          onChangeView={changeView}
          onCreate={() => openCreate('invoice')}
        />
      ) : (
        <DevisTab
          rows={devisRows}
          viewMode={viewMode}
          onChangeView={changeView}
          onCreate={() => openCreate('quote')}
        />
      )}
    </div>
  );
}
