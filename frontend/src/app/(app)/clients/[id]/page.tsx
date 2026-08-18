'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { BackButton } from '@/components/ui/BackButton';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { ProjectRow } from '@/components/dashboard/ProjectRow';
import { InvoiceRow } from '@/components/invoices/InvoiceRow';
import { ClientForm } from '@/components/forms/ClientForm';
import { ProjectForm } from '@/components/forms/ProjectForm';
import { InvoiceForm } from '@/components/forms/InvoiceForm';
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
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: client, loading, error, refresh } = useApi<ClientDetail>(`/api/clients/${id}`);
  const [editOpen, setEditOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingProjectOpen, setCreatingProjectOpen] = useState(false);
  const [creatingInvoiceOpen, setCreatingInvoiceOpen] = useState(false);

  if (!user) return null;

  const devisRows = client?.invoices.filter((inv) => inv.docType === 'QUOTE') ?? [];
  const factureRows = client?.invoices.filter((inv) => inv.docType !== 'QUOTE') ?? [];

  async function copyTrackingLink() {
    if (!client) return;
    const url = `${window.location.origin}/suivi/${client.trackingToken}`;
    await navigator.clipboard.writeText(url);
    toast('Lien de suivi copié.', 'success');
  }

  async function toggleArchive() {
    if (!client) return;
    const nextStatus = client.status === 'archived' ? 'active' : 'archived';
    setArchiving(true);
    try {
      await api(`/api/clients/${client.id}`, { method: 'PATCH', body: { status: nextStatus } });
      invalidateCachePrefix('/api/clients');
      toast(nextStatus === 'archived' ? 'Client archivé.' : 'Client réactivé.', 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
    } finally {
      setArchiving(false);
    }
  }

  async function deleteClient() {
    if (!client) return;
    setDeleting(true);
    try {
      await api(`/api/clients/${client.id}`, { method: 'DELETE' });
      invalidateCachePrefix('/api/clients');
      toast('Client supprimé.', 'success');
      router.push('/clients');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
      setDeleting(false);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <BackButton fallbackHref="/clients" label="Clients" className="mb-4" />

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
            <div className="flex flex-shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={copyTrackingLink}
                className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground"
              >
                <Icon i="link" size={15} />
                Copier le lien de suivi
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground"
              >
                <Icon i="pen-line" size={15} />
                Modifier
              </button>
              <button
                type="button"
                onClick={() => void toggleArchive()}
                disabled={archiving}
                className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
              >
                <Icon i={client.status === 'archived' ? 'check-circle' : 'archive'} size={15} />
                {client.status === 'archived' ? 'Réactiver' : 'Archiver'}
              </button>
              {client.projects.length === 0 && client.invoices.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-2 rounded-md border border-tag-red-fg px-4 py-2.5 font-body text-sm font-medium text-tag-red-fg"
                >
                  <Icon i="trash" size={15} />
                  Supprimer
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-muted-foreground opacity-50"
                  >
                    <Icon i="trash" size={15} />
                    Supprimer
                  </button>
                  <InfoTooltip text="Suppression impossible : ce client a au moins un projet, devis ou facture lié. Archive-le si tu veux le sortir de tes listes actives." />
                </div>
              )}
            </div>
          </div>

          {editOpen && (
            <Modal title="Modifier le client" onClose={() => setEditOpen(false)} size="lg">
              <ClientForm
                client={{
                  id: client.id,
                  name: client.name,
                  company: client.company,
                  contactName: client.contactName,
                  website: client.website,
                  phone: client.phone,
                  email: client.email,
                  city: client.city,
                  sector: client.sector,
                  notes: client.notes,
                }}
                onDone={() => {
                  setEditOpen(false);
                  void refresh();
                }}
              />
            </Modal>
          )}

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
                onClick={() => setCreatingProjectOpen(true)}
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
                        dueDate: p.dueDate,
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
                Devis ({devisRows.length})
              </h2>
              <button
                type="button"
                onClick={() => router.push(`/invoices/new-quote?clientId=${client.id}`)}
                className="flex items-center gap-1.5 font-body text-xs font-medium text-primary"
              >
                <Icon i="plus" size={14} />
                Nouveau devis
              </button>
            </div>
            <div className="p-5">
              {devisRows.length === 0 ? (
                <EmptyState
                  icon="file-text"
                  title="Aucun devis"
                  description="Les devis de ce client apparaîtront ici."
                />
              ) : (
                <div>
                  {devisRows.map((inv) => (
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

          <div className="rounded-lg border border-border bg-canvas shadow-card">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="font-headings text-sm font-bold text-foreground">
                Factures ({factureRows.length})
              </h2>
              <button
                type="button"
                onClick={() => setCreatingInvoiceOpen(true)}
                className="flex items-center gap-1.5 font-body text-xs font-medium text-primary"
              >
                <Icon i="plus" size={14} />
                Créer facture
              </button>
            </div>
            <div className="p-5">
              {factureRows.length === 0 ? (
                <EmptyState
                  icon="file-text"
                  title="Aucune facture"
                  description="Les factures de ce client apparaîtront ici."
                />
              ) : (
                <div>
                  {factureRows.map((inv) => (
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

          {creatingProjectOpen && (
            <Modal title="Nouveau projet" onClose={() => setCreatingProjectOpen(false)}>
              <ProjectForm
                lockedClient={{ id: client.id, label: client.name }}
                extraBody={{ clientId: client.id }}
                onDone={() => {
                  setCreatingProjectOpen(false);
                  invalidateCachePrefix('/api/clients');
                  void refresh();
                }}
                onNeedClient={() => {}}
              />
            </Modal>
          )}

          {creatingInvoiceOpen && (
            <Modal title="Créer facture" onClose={() => setCreatingInvoiceOpen(false)} size="lg">
              <InvoiceForm
                lockedClient={{ id: client.id, label: client.name }}
                extraBody={{ clientId: client.id }}
                onDone={() => {
                  setCreatingInvoiceOpen(false);
                  invalidateCachePrefix('/api/clients');
                  void refresh();
                }}
                onNeedClient={() => {}}
              />
            </Modal>
          )}

          {confirmingDelete && (
            <Modal title="Supprimer le client" onClose={() => setConfirmingDelete(false)}>
              <p className="font-body text-sm text-muted-foreground">
                {client.name} sera définitivement supprimé. Cette action est irréversible.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void deleteClient()}
                  disabled={deleting}
                  className="rounded-md bg-tag-red-fg px-4 py-2 font-body text-sm font-medium text-white disabled:opacity-50"
                >
                  {deleting ? 'Suppression…' : 'Supprimer définitivement'}
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
