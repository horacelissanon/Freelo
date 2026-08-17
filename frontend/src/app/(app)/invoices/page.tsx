'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { InvoiceRow } from '@/components/invoices/InvoiceRow';
import { InvoiceCard } from '@/components/invoices/InvoiceCard';
import { InvoicesEmptyState } from '@/components/invoices/InvoicesEmptyState';
import { StatCard } from '@/components/dashboard/StatCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { ViewToggle, type ListViewMode } from '@/components/ui/ViewToggle';
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs';
import { DateFilterBar } from '@/components/ui/DateFilterBar';
import { ExportButtons } from '@/components/ui/ExportButtons';
import type { ExportColumn } from '@/lib/export/types';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { formatPrice, formatDate } from '@/lib/utils';
import { computeBalance, computePackDeposit, type PackDepositSource } from '@/lib/invoiceTotals';
import { INVOICE_STATUS_LABELS, type InvoiceStatus, type InvoiceDocType } from '@/lib/constants';
import { DEFAULT_DATE_FILTER, isWithinDateFilter, type DateFilterValue } from '@/lib/dateFilter';

const VIEW_STORAGE_KEY = 'freelo-invoices-view';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

// Devis never reach PAID/OVERDUE/CANCELED (those are invoice-lifecycle
// states) — each tab only offers the statuses that can actually occur on
// its own documents, per "un onglet bien séparé et adapté à chacun".
const FACTURE_STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELED'];
const DEVIS_STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED'];

interface InvoicePackRow extends PackDepositSource {
  id: string;
}

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
  depositAmount: number | null;
  selectedPackId: string | null;
  packs: InvoicePackRow[];
  /** Actual amount received once this devis became a project — 0 until a
   *  linked project's deposit shows PAID, per GET /api/invoices. */
  depositReceived: number;
}

// Facture: depositAmount is a stored figure, solde is the simple remainder.
// Devis: no stored figure pre-acceptance — estimated from whichever pack the
// row can unambiguously resolve (the selected one, or the only one); several
// un-decided offers have no single "the" deposit to show, so null.
function resolveDevisDeposit(row: InvoiceApiRow): number | null {
  const resolvedPack = row.selectedPackId
    ? row.packs.find((p) => p.id === row.selectedPackId)
    : row.packs.length === 1
      ? row.packs[0]
      : undefined;
  return resolvedPack ? computePackDeposit(resolvedPack) : null;
}

function resolveDeposit(row: InvoiceApiRow): number | null {
  return row.docType === 'INVOICE' ? row.depositAmount : resolveDevisDeposit(row);
}

function SearchFilterBar({
  search,
  onSearch,
  viewMode,
  onChangeView,
  placeholder,
  exportFilename,
  exportTitle,
  exportColumns,
  exportRows,
}: {
  search: string;
  onSearch: (v: string) => void;
  viewMode: ListViewMode;
  onChangeView: (v: ListViewMode) => void;
  placeholder: string;
  exportFilename: string;
  exportTitle: string;
  exportColumns: ExportColumn<InvoiceApiRow>[];
  exportRows: InvoiceApiRow[];
}) {
  return (
    <div className="mb-6 flex gap-2 rounded-lg border border-border bg-canvas shadow-card p-4">
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
      <ExportButtons
        filename={exportFilename}
        title={exportTitle}
        subtitle={`${exportRows.length} document${exportRows.length !== 1 ? 's' : ''}`}
        columns={exportColumns}
        rows={exportRows}
      />
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
        {items.map((i) => {
          const depositAmount = resolveDeposit(i);
          return (
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
                depositAmount,
                balanceAmount:
                  i.docType === 'INVOICE' && depositAmount != null
                    ? computeBalance(i.amount, depositAmount)
                    : null,
              }}
            />
          );
        })}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
      {items.map((i, idx) => {
        const depositAmount = resolveDeposit(i);
        return (
          <InvoiceRow
            key={i.id}
            index={idx}
            invoice={{
              id: i.id,
              number: i.number,
              docType: i.docType,
              status: i.status,
              clientName: i.client.name,
              amount: i.amount,
              currency: i.currency,
              dueDateLabel: i.dueDate ? formatDate(i.dueDate) : null,
              depositAmount,
              balanceAmount:
                i.docType === 'INVOICE' && depositAmount != null
                  ? computeBalance(i.amount, depositAmount)
                  : null,
            }}
          />
        );
      })}
    </div>
  );
}

const FACTURE_EXPORT_COLUMNS: ExportColumn<InvoiceApiRow>[] = [
  { header: 'Numéro', width: 1, value: (r) => r.number },
  { header: 'Client', width: 2, value: (r) => r.client.name },
  { header: 'Statut', width: 1, value: (r) => INVOICE_STATUS_LABELS[r.status] },
  { header: 'Montant', width: 1, value: (r) => `${r.amount} ${r.currency}` },
  {
    header: 'Acompte',
    width: 1,
    value: (r) => {
      const deposit = resolveDeposit(r);
      return deposit != null ? `${deposit} ${r.currency}` : '';
    },
  },
  {
    header: 'Solde',
    width: 1,
    value: (r) => {
      const deposit = resolveDeposit(r);
      return deposit != null ? `${computeBalance(r.amount, deposit)} ${r.currency}` : '';
    },
  },
  { header: 'Échéance', width: 1, value: (r) => (r.dueDate ? formatDate(r.dueDate) : '') },
];

const DEVIS_EXPORT_COLUMNS: ExportColumn<InvoiceApiRow>[] = [
  { header: 'Numéro', width: 1, value: (r) => r.number },
  { header: 'Client', width: 2, value: (r) => r.client.name },
  { header: 'Statut', width: 1, value: (r) => INVOICE_STATUS_LABELS[r.status] },
  { header: 'Montant', width: 1, value: (r) => `${r.amount} ${r.currency}` },
  {
    header: 'Acompte prévu',
    width: 1,
    value: (r) => {
      const deposit = resolveDeposit(r);
      return deposit != null ? `${deposit} ${r.currency}` : '';
    },
  },
];

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
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);

  // The date filter scopes the cadrans too (not just the list below) — a
  // freelance picks "Ce mois" and every number on the page reflects that.
  const dateScoped = rows.filter((r) => isWithinDateFilter(r.createdAt, dateFilter));

  const statusTabs: FilterTab[] = [
    { key: 'all', label: 'Tout', count: dateScoped.length },
    ...FACTURE_STATUSES.map((s) => ({
      key: s,
      label: INVOICE_STATUS_LABELS[s],
      count: dateScoped.filter((r) => r.status === s).length,
    })),
  ];

  // Only applied on "Tout" — an explicit status pick (e.g. "Payée") must
  // never come back empty just because the default view hides paid rows.
  const statusScoped =
    hidePaidByDefault && statusFilter === 'all'
      ? dateScoped.filter((r) => r.status !== 'PAID')
      : dateScoped;
  const scoped = statusScoped.filter((r) => statusFilter === 'all' || r.status === statusFilter);

  const searchQuery = search.trim().toLowerCase();
  const filtered = scoped
    .filter((r) => {
      if (!searchQuery) return true;
      return (
        r.number.toLowerCase().includes(searchQuery) ||
        r.client.name.toLowerCase().includes(searchQuery)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const totalPaid = dateScoped
    .filter((r) => r.status === 'PAID')
    .reduce((sum, r) => sum + r.amount, 0);
  // Split rather than folded together — "En attente" (not yet due) and "En
  // retard" (past due, needs chasing) call for different actions, so they
  // stay two distinct cards instead of one combined total.
  const totalPending = dateScoped
    .filter((r) => r.status === 'SENT')
    .reduce((sum, r) => sum + r.amount, 0);
  const totalOverdue = dateScoped
    .filter((r) => r.status === 'OVERDUE')
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <>
      {rows.length > 0 && (
        <div className="mb-6">
          <FilterTabs tabs={statusTabs} active={statusFilter} onChange={setStatusFilter} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-6">
          <DateFilterBar value={dateFilter} onChange={setDateFilter} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard
            label="Chiffre d'affaires total"
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
          <StatCard
            label="En retard"
            value={formatPrice(totalOverdue)}
            unit="XOF"
            icon="alert-circle"
          />
        </div>
      )}

      <SearchFilterBar
        search={search}
        onSearch={setSearch}
        viewMode={viewMode}
        onChangeView={onChangeView}
        placeholder="Rechercher une facture (numéro, client)…"
        exportFilename="factures"
        exportTitle="Factures"
        exportColumns={FACTURE_EXPORT_COLUMNS}
        exportRows={filtered}
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
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);

  const dateScoped = rows.filter((r) => isWithinDateFilter(r.createdAt, dateFilter));

  const statusTabs: FilterTab[] = [
    { key: 'all', label: 'Tout', count: dateScoped.length },
    ...DEVIS_STATUSES.map((s) => ({
      key: s,
      label: INVOICE_STATUS_LABELS[s],
      count: dateScoped.filter((r) => r.status === s).length,
    })),
  ];

  const scoped = dateScoped.filter((r) => statusFilter === 'all' || r.status === statusFilter);

  const searchQuery = search.trim().toLowerCase();
  const filtered = scoped
    .filter((r) => {
      if (!searchQuery) return true;
      return (
        r.number.toLowerCase().includes(searchQuery) ||
        r.client.name.toLowerCase().includes(searchQuery)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Brouillon (never sent) and Expiré (dead, never accepted) are excluded
  // from every card below — neither represents real pending or won
  // business, so folding them into "value" totals would inflate the
  // numbers with speculative or already-lost devis. Still fully visible in
  // the list underneath via the status filter.
  const pendingRows = dateScoped.filter((r) => r.status === 'SENT');
  const acceptedRows = dateScoped.filter((r) => r.status === 'ACCEPTED');
  const totalPending = pendingRows.reduce((sum, r) => sum + r.amount, 0);
  const depositExpected = [...pendingRows, ...acceptedRows].reduce(
    (sum, r) => sum + (resolveDevisDeposit(r) ?? 0),
    0,
  );
  const depositReceived = [...pendingRows, ...acceptedRows].reduce(
    (sum, r) => sum + r.depositReceived,
    0,
  );

  return (
    <>
      {rows.length > 0 && (
        <div className="mb-6">
          <FilterTabs tabs={statusTabs} active={statusFilter} onChange={setStatusFilter} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-6">
          <DateFilterBar value={dateFilter} onChange={setDateFilter} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard
            label="En attente"
            value={formatPrice(totalPending)}
            unit="XOF"
            icon="file-clock"
          />
          <StatCard label="Acceptés" value={String(acceptedRows.length)} icon="check-circle" />
          <StatCard
            label="Acompte prévu"
            value={formatPrice(depositExpected)}
            unit="XOF"
            icon="banknote"
          />
          <StatCard
            label="Acompte reçu"
            value={formatPrice(depositReceived)}
            unit="XOF"
            icon="wallet"
          />
        </div>
      )}

      <SearchFilterBar
        search={search}
        onSearch={setSearch}
        viewMode={viewMode}
        onChangeView={onChangeView}
        placeholder="Rechercher un devis (numéro, client)…"
        exportFilename="devis"
        exportTitle="Devis"
        exportColumns={DEVIS_EXPORT_COLUMNS}
        exportRows={filtered}
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

function InvoicesPageInner() {
  const user = useUser();
  const { openCreate } = useCreateMenu();
  const searchParams = useSearchParams();
  // Which view this page shows is decided entirely by the URL (?tab=devis|
  // factures), set by the Sidebar/BottomNav's now-separate Devis/Factures
  // links (no more in-page tab switcher) — so navigating into a devis/
  // facture detail page and back (BackButton's router.back()) still
  // restores the right one, instead of always resetting to "Factures".
  const tabParam = searchParams.get('tab');
  const activeTab: 'factures' | 'devis' = tabParam === 'devis' ? 'devis' : 'factures';
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
      <div className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
          {activeTab === 'devis' ? 'Devis' : 'Factures'}
        </h1>
        <p className="font-body text-sm text-muted-foreground">
          {activeTab === 'devis' ? 'Gérez vos devis.' : 'Gérez vos factures.'}
        </p>
      </div>

      {items.length > 0 && (
        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={() => openCreate(activeTab === 'devis' ? 'quote' : 'invoice')}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground sm:w-auto"
          >
            <Icon i="plus" size={16} />
            {activeTab === 'devis' ? 'Nouveau devis' : 'Créer facture'}
          </button>
        </div>
      )}

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

export default function InvoicesPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesPageInner />
    </Suspense>
  );
}
