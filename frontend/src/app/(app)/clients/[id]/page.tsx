'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { useApi } from '@/lib/useApi';
import { formatDate } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { ProjectRow } from '@/components/dashboard/ProjectRow';
import { InvoiceRow } from '@/components/invoices/InvoiceRow';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import {
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_COLORS,
  type ClientStatus,
  type ProjectStatus,
  type InvoiceStatus,
  type InvoiceDocType,
} from '@/lib/constants';

interface ClientDetailProject {
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

interface ClientDetailInvoice {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  dueDate: string | null;
}

interface ClientDetail {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  city: string | null;
  sector: string | null;
  notes: string | null;
  status: ClientStatus;
  trackingToken: string;
  projects: ClientDetailProject[];
  invoices: ClientDetailInvoice[];
}

export default function ClientDetailPage() {
  const user = useUser();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { openCreate } = useCreateMenu();
  const { data: client, loading, error, refresh } = useApi<ClientDetail>(`/api/clients/${id}`);

  if (!user) return null;

  async function copyTrackingLink() {
    if (!client) return;
    const url = `${window.location.origin}/suivi/${client.trackingToken}`;
    await navigator.clipboard.writeText(url);
    toast('Lien de suivi copié.', 'success');
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/clients"
        className="mb-4 inline-flex items-center gap-1 font-body text-sm text-muted-foreground hover:text-foreground"
      >
        <Icon i="chevron-left" size={16} />
        Clients
      </Link>

      {loading ? (
        <LoadingState />
      ) : error || !client ? (
        <ErrorState message={error ?? 'Client introuvable.'} onRetry={refresh} />
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-canvas shadow-card p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <Avatar name={client.name} className="h-14 w-14 flex-shrink-0 text-lg" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-headings text-xl font-bold text-foreground sm:text-2xl">
                    {client.name}
                  </h1>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${CLIENT_STATUS_COLORS[client.status].bg} ${CLIENT_STATUS_COLORS[client.status].fg}`}
                  >
                    {CLIENT_STATUS_LABELS[client.status]}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                    {client.code}
                  </span>
                </div>
                {client.company && (
                  <p className="mt-0.5 font-body text-sm text-muted-foreground">{client.company}</p>
                )}
                <div className="mt-3 flex flex-col gap-1.5 font-body text-sm text-muted-foreground">
                  {client.contactName && (
                    <span className="flex items-center gap-2">
                      <Icon i="user" size={14} /> {client.contactName}
                    </span>
                  )}
                  {client.email && (
                    <span className="flex items-center gap-2">
                      <Icon i="mail" size={14} /> {client.email}
                    </span>
                  )}
                  {client.phone && (
                    <span className="flex items-center gap-2">
                      <Icon i="phone" size={14} /> {client.phone}
                    </span>
                  )}
                  {client.city && (
                    <span className="flex items-center gap-2">
                      <Icon i="map-pin" size={14} /> {client.city}
                    </span>
                  )}
                  {client.website && (
                    <span className="flex items-center gap-2">
                      <Icon i="globe" size={14} /> {client.website}
                    </span>
                  )}
                  {client.sector && (
                    <span className="flex items-center gap-2">
                      <Icon i="tag" size={14} /> {client.sector}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={copyTrackingLink}
              className="flex flex-shrink-0 items-center gap-2 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground"
            >
              <Icon i="link" size={15} />
              Copier le lien de suivi
            </button>
          </div>

          {client.notes && (
            <div className="mb-6 rounded-lg border border-border bg-canvas shadow-card p-5">
              <h2 className="mb-2 font-headings text-sm font-bold text-foreground">Notes</h2>
              <p className="font-body text-sm whitespace-pre-wrap text-muted-foreground">
                {client.notes}
              </p>
            </div>
          )}

          <div className="mb-6 rounded-lg border border-border bg-canvas shadow-card">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="font-headings text-sm font-bold text-foreground">
                Projets ({client.projects.length})
              </h2>
              <button
                type="button"
                onClick={() => openCreate('project')}
                className="flex items-center gap-1.5 font-body text-xs font-medium text-primary"
              >
                <Icon i="plus" size={14} />
                Nouveau projet
              </button>
            </div>
            <div className="p-5">
              {client.projects.length === 0 ? (
                <EmptyState
                  icon="folder-open"
                  title="Aucun projet"
                  description="Les projets de ce client apparaîtront ici."
                />
              ) : (
                <div>
                  {client.projects.map((p) => (
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
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-canvas shadow-card">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="font-headings text-sm font-bold text-foreground">
                Factures &amp; devis ({client.invoices.length})
              </h2>
              <button
                type="button"
                onClick={() => openCreate('invoice')}
                className="flex items-center gap-1.5 font-body text-xs font-medium text-primary"
              >
                <Icon i="plus" size={14} />
                Nouvelle facture
              </button>
            </div>
            <div className="p-5">
              {client.invoices.length === 0 ? (
                <EmptyState
                  icon="file-text"
                  title="Aucune facture"
                  description="Les factures et devis de ce client apparaîtront ici."
                />
              ) : (
                <div>
                  {client.invoices.map((inv) => (
                    <InvoiceRow
                      key={inv.id}
                      invoice={{
                        id: inv.id,
                        number: inv.number,
                        docType: inv.docType,
                        status: inv.status,
                        clientName: client.name,
                        amount: inv.amount,
                        currency: inv.currency,
                        dueDateLabel: inv.dueDate ? formatDate(inv.dueDate) : null,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
