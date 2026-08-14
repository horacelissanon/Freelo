'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { formatPrice, formatLongDate } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState } from '@/components/ui/PageStates';
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  DOC_TYPE_LABELS,
  type InvoiceStatus,
  type InvoiceDocType,
} from '@/lib/constants';

const PATCHABLE_STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'ACCEPTED'];

interface InvoiceRelation {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
}

interface InvoiceDetail {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
  description: string | null;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string | null;
  client: { id: string; name: string };
  project: { id: string; name: string } | null;
  relatedInvoice: InvoiceRelation | null;
  creditNote: InvoiceRelation | null;
}

export default function InvoiceDetailPage() {
  const user = useUser();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: invoice, loading, error, refresh } = useApi<InvoiceDetail>(`/api/invoices/${id}`);
  const [changingStatus, setChangingStatus] = useState<InvoiceStatus | null>(null);
  const [confirmingCreditNote, setConfirmingCreditNote] = useState(false);
  const [issuingCreditNote, setIssuingCreditNote] = useState(false);

  if (!user) return null;

  async function changeStatus(status: InvoiceStatus) {
    if (!invoice) return;
    setChangingStatus(status);
    try {
      await api(`/api/invoices/${invoice.id}`, { method: 'PATCH', body: { status } });
      invalidateCachePrefix('/api/invoices');
      toast('Statut mis à jour.', 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
    } finally {
      setChangingStatus(null);
    }
  }

  async function issueCreditNote() {
    if (!invoice) return;
    setIssuingCreditNote(true);
    try {
      await api(`/api/invoices/${invoice.id}/credit-note`, { method: 'POST' });
      invalidateCachePrefix('/api/invoices');
      toast('Avoir émis, la facture est annulée.', 'success');
      setConfirmingCreditNote(false);
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
    } finally {
      setIssuingCreditNote(false);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1 font-body text-sm text-muted-foreground hover:text-foreground"
      >
        <Icon i="chevron-left" size={16} />
        Devis &amp; Factures
      </Link>

      {loading ? (
        <LoadingState />
      ) : error || !invoice ? (
        <ErrorState message={error ?? 'Document introuvable.'} onRetry={refresh} />
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-canvas p-5 shadow-card sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-headings text-xl font-bold text-foreground sm:text-2xl">
                  {DOC_TYPE_LABELS[invoice.docType].long} {invoice.number}
                </h1>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${INVOICE_STATUS_COLORS[invoice.status].bg} ${INVOICE_STATUS_COLORS[invoice.status].fg}`}
                >
                  {INVOICE_STATUS_LABELS[invoice.status]}
                </span>
              </div>
              <Link
                href={`/clients/${invoice.client.id}`}
                className="mt-1 inline-flex items-center gap-1.5 font-body text-sm text-muted-foreground hover:text-foreground"
              >
                <Icon i="user" size={13} />
                {invoice.client.name}
              </Link>
              {invoice.project && (
                <Link
                  href={`/projects/${invoice.project.id}`}
                  className="mt-1 flex items-center gap-1.5 font-body text-sm text-muted-foreground hover:text-foreground"
                >
                  <Icon i="folder-open" size={13} />
                  {invoice.project.name}
                </Link>
              )}
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Émise le {formatLongDate(invoice.issueDate)}
                {invoice.dueDate ? ` — échéance ${formatLongDate(invoice.dueDate)}` : ''}
              </p>
            </div>
            <p className="font-headings text-2xl font-bold text-foreground">
              {formatPrice(invoice.amount, invoice.currency)}
            </p>
          </div>

          {invoice.description && (
            <div className="mb-6 rounded-lg border border-border bg-canvas p-5 shadow-card">
              <h2 className="mb-2 font-headings text-sm font-bold text-foreground">Description</h2>
              <p className="font-body text-sm whitespace-pre-wrap text-muted-foreground">
                {invoice.description}
              </p>
            </div>
          )}

          {invoice.docType === 'CREDIT_NOTE' && invoice.relatedInvoice && (
            <div className="mb-6 rounded-lg border border-border bg-canvas p-5 shadow-card">
              <p className="font-body text-sm text-muted-foreground">
                Cet avoir annule la facture{' '}
                <Link
                  href={`/invoices/${invoice.relatedInvoice.id}`}
                  className="font-medium text-primary"
                >
                  {invoice.relatedInvoice.number}
                </Link>
                .
              </p>
            </div>
          )}

          {invoice.creditNote && (
            <div className="mb-6 rounded-lg border border-tag-red-fg/30 bg-canvas p-5 shadow-card">
              <p className="font-body text-sm text-muted-foreground">
                Cette facture est annulée par l&apos;avoir{' '}
                <Link
                  href={`/invoices/${invoice.creditNote.id}`}
                  className="font-medium text-primary"
                >
                  {invoice.creditNote.number}
                </Link>
                .
              </p>
            </div>
          )}

          {invoice.docType !== 'CREDIT_NOTE' && invoice.status !== 'CANCELED' && (
            <div className="mb-6 rounded-lg border border-border bg-canvas p-5 shadow-card">
              <h2 className="mb-3 font-headings text-sm font-bold text-foreground">Statut</h2>
              <div className="flex flex-wrap gap-2">
                {PATCHABLE_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={changingStatus !== null || s === invoice.status}
                    onClick={() => void changeStatus(s)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-body text-xs font-medium disabled:opacity-50 ${
                      s === invoice.status
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-canvas text-foreground'
                    }`}
                  >
                    {changingStatus === s ? 'Enregistrement…' : INVOICE_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {invoice.docType === 'INVOICE' &&
            invoice.status !== 'CANCELED' &&
            !invoice.creditNote && (
              <div className="rounded-lg border border-tag-red-fg/30 bg-canvas p-5 shadow-card">
                <h2 className="font-headings text-lg font-semibold text-foreground">
                  Zone dangereuse
                </h2>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Une facture ne peut pas être supprimée. En cas d&apos;erreur, émets un avoir pour
                  l&apos;annuler intégralement — un nouveau document sera créé et cette facture
                  passera au statut « Annulée ».
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmingCreditNote(true)}
                  className="mt-3 flex items-center gap-1.5 rounded-md border border-tag-red-fg px-4 py-2 font-body text-sm font-medium text-tag-red-fg"
                >
                  <Icon i="file-clock" size={14} />
                  Émettre un avoir
                </button>
              </div>
            )}

          {confirmingCreditNote && (
            <Modal title="Émettre un avoir" onClose={() => setConfirmingCreditNote(false)}>
              <p className="font-body text-sm text-muted-foreground">
                Un avoir de {formatPrice(invoice.amount, invoice.currency)} sera créé pour annuler
                la facture {invoice.number}. Cette action est irréversible.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingCreditNote(false)}
                  className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void issueCreditNote()}
                  disabled={issuingCreditNote}
                  className="rounded-md bg-tag-red-fg px-4 py-2 font-body text-sm font-medium text-white disabled:opacity-50"
                >
                  {issuingCreditNote ? 'Émission…' : "Émettre l'avoir"}
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
