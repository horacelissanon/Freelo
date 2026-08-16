'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { formatPrice, formatLongDate, formatDate } from '@/lib/utils';
import { computeBalance } from '@/lib/invoiceTotals';
import { resolveDocumentIdentity } from '@/lib/documentIdentity';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { BackButton } from '@/components/ui/BackButton';
import { PackOfferCard } from '@/components/invoices/PackOfferCard';
import { InvoiceForm } from '@/components/forms/InvoiceForm';
import { ProjectForm } from '@/components/forms/ProjectForm';
import { LoadingState, ErrorState } from '@/components/ui/PageStates';
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  DOC_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type InvoiceStatus,
  type InvoiceDocType,
  type ProjectType,
  type PaymentMethod,
} from '@/lib/constants';

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

const OTHER_STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'OVERDUE', 'ACCEPTED'];

interface InvoiceRelation {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
}

interface InvoiceClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
}

interface InvoiceLineItemRow {
  id: string;
  designation: string;
  quantity: number;
  unitPrice: number;
}

interface InvoicePackRow {
  id: string;
  title: string;
  description: string | null;
  items: InvoiceLineItemRow[];
  depositType: string | null;
  depositValue: number | null;
}

interface QuoteContentBlockRow {
  id: string;
  kind: string;
  primaryText: string;
  secondaryText: string | null;
}

interface InvoiceDetail {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
  description: string | null;
  sector: string | null;
  type: string | null;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string | null;
  client: InvoiceClient;
  project: { id: string; name: string } | null;
  relatedInvoice: InvoiceRelation | null;
  creditNote: InvoiceRelation | null;
  lineItems: InvoiceLineItemRow[];
  packs: InvoicePackRow[];
  selectedPackId: string | null;
  depositAmount: number | null;
  deliveryDate: string | null;
  paymentMethodNote: string | null;
  footerNote: string | null;
  paymentTermsNote: string | null;
  contentBlocks: QuoteContentBlockRow[];
  trackingToken: string;
}

export default function InvoiceDetailPage() {
  const user = useUser();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: invoice, loading, error, refresh } = useApi<InvoiceDetail>(`/api/invoices/${id}`);
  const [changingStatus, setChangingStatus] = useState<InvoiceStatus | null>(null);
  const [confirmingPaid, setConfirmingPaid] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmingCreditNote, setConfirmingCreditNote] = useState(false);
  const [issuingCreditNote, setIssuingCreditNote] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingProjectOpen, setCreatingProjectOpen] = useState(false);
  const [depositChoice, setDepositChoice] = useState<'RECEIVED' | 'NOT_RECEIVED' | null>(null);
  const [depositStepDone, setDepositStepDone] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<PaymentMethod | ''>('');
  const [depositPaymentMethodOther, setDepositPaymentMethodOther] = useState('');

  function closeCreatingProject() {
    setCreatingProjectOpen(false);
    setDepositChoice(null);
    setDepositStepDone(false);
    setDepositAmount('');
    setDepositPaymentMethod('');
    setDepositPaymentMethodOther('');
  }

  if (!user) return null;

  const providerIdentity = resolveDocumentIdentity(user);

  async function copyClientLink() {
    if (!invoice) return;
    const url = `${window.location.origin}/suivi/${invoice.trackingToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Lien copié.', 'success');
    } catch {
      toast('Impossible de copier le lien.', 'error');
    }
  }

  function sendClientLinkViaWhatsApp() {
    if (!invoice) return;
    const url = `${window.location.origin}/suivi/${invoice.trackingToken}`;
    const providerLabel = providerIdentity.name;
    const message =
      invoice.docType === 'QUOTE'
        ? `Bonjour ${invoice.client.name}, voici votre devis ${invoice.number} de la part de ${providerLabel}. Vous pouvez le consulter et le valider directement en ligne ici : ${url}`
        : `Bonjour ${invoice.client.name}, voici votre facture ${invoice.number} de la part de ${providerLabel}. Vous pouvez la consulter et suivre son règlement ici : ${url}`;
    const phoneDigits = invoice.client.phone?.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${phoneDigits || ''}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  function openClientLink() {
    if (!invoice) return;
    window.open(
      `${window.location.origin}/suivi/${invoice.trackingToken}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

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

  async function deleteInvoice() {
    if (!invoice) return;
    setDeleting(true);
    try {
      await api(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
      invalidateCachePrefix('/api/invoices');
      toast('Brouillon supprimé.', 'success');
      router.push('/invoices');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
      setDeleting(false);
    }
  }

  const selectedPack = invoice?.packs.find((p) => p.id === invoice.selectedPackId) ?? null;
  // Inherits the offer's own deposit terms when the pack declared one;
  // otherwise falls back to the system default (PERCENT, 50%) rather than a
  // hardcoded 30% estimate that no longer matches Project.depositType's
  // actual default.
  const packDepositType: 'FIXED' | 'PERCENT' =
    selectedPack?.depositType === 'FIXED' || selectedPack?.depositType === 'PERCENT'
      ? selectedPack.depositType
      : 'PERCENT';
  const packDepositValue =
    selectedPack?.depositType != null ? (selectedPack.depositValue ?? 0) : 50;
  const estimatedDeposit =
    packDepositType === 'FIXED'
      ? packDepositValue
      : Math.round((invoice?.amount ?? 0) * (packDepositValue / 100));

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <BackButton
        fallbackHref={
          invoice?.docType === 'QUOTE' ? '/invoices?tab=devis' : '/invoices?tab=factures'
        }
        label={invoice?.docType === 'QUOTE' ? 'Devis' : 'Factures'}
        className="mb-4 print:hidden"
      />

      {loading ? (
        <LoadingState />
      ) : error || !invoice ? (
        <ErrorState message={error ?? 'Document introuvable.'} onRetry={refresh} />
      ) : (
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6 print:block">
          {/* Left: document-style preview */}
          <div className="mb-6 overflow-hidden rounded-lg border border-border bg-canvas shadow-card lg:col-start-1 lg:row-start-1 lg:mb-0 print:border-0 print:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-6">
              <div className="flex items-center gap-3">
                <Avatar
                  name={providerIdentity.name}
                  className="h-11 w-11 flex-shrink-0 text-base"
                />
                <div>
                  <p className="font-headings text-sm font-bold text-foreground">
                    {providerIdentity.name}
                  </p>
                  {providerIdentity.address && (
                    <p className="font-body text-xs text-muted-foreground">
                      {providerIdentity.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <a
                  href={`/api/invoices/${invoice.id}/pdf`}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-body text-xs font-medium text-foreground hover:border-primary/40 print:hidden"
                >
                  <Icon i="download" size={13} />
                  Télécharger {invoice.docType === 'QUOTE' ? 'le devis' : 'la facture'}
                </a>
                <h1 className="font-headings text-2xl font-bold tracking-tight text-foreground">
                  {DOC_TYPE_LABELS[invoice.docType].long.toUpperCase()}
                </h1>
                <p className="font-body text-sm font-medium text-primary">{invoice.number}</p>
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  Émise le {formatLongDate(invoice.issueDate)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-b border-border p-6 sm:grid-cols-2">
              <div>
                <p className="font-body text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  Prestataire
                </p>
                <p className="mt-1 font-body text-sm font-medium text-foreground">
                  {providerIdentity.name}
                </p>
                <p className="font-body text-xs text-muted-foreground">{user.email}</p>
                {providerIdentity.phone && (
                  <p className="font-body text-xs text-muted-foreground">
                    {providerIdentity.phone}
                  </p>
                )}
                {(providerIdentity.taxId || providerIdentity.commerceRegistry) && (
                  <p className="font-body text-xs text-muted-foreground">
                    {[
                      providerIdentity.taxId && `NIF ${providerIdentity.taxId}`,
                      providerIdentity.commerceRegistry &&
                        `RCCM ${providerIdentity.commerceRegistry}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <div>
                <p className="font-body text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  Client
                </p>
                <Link
                  href={`/clients/${invoice.client.id}`}
                  className="mt-1 block font-body text-sm font-medium text-foreground hover:text-primary"
                >
                  {invoice.client.name}
                </Link>
                {invoice.client.company && (
                  <p className="font-body text-xs text-muted-foreground">
                    {invoice.client.company}
                  </p>
                )}
                {invoice.client.email && (
                  <p className="font-body text-xs text-muted-foreground">{invoice.client.email}</p>
                )}
                {invoice.client.phone && (
                  <p className="font-body text-xs text-muted-foreground">{invoice.client.phone}</p>
                )}
              </div>
            </div>

            <div className="p-6">
              {invoice.lineItems.length > 0 ? (
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="flex bg-secondary px-4 py-2.5 font-body text-xs font-semibold text-muted-foreground">
                    <span className="flex-1">Désignation</span>
                    <span className="w-12 flex-shrink-0 text-right">Qté</span>
                    <span className="w-28 flex-shrink-0 text-right">Prix unit.</span>
                    <span className="w-28 flex-shrink-0 text-right">Total</span>
                  </div>
                  {invoice.lineItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center border-t border-border px-4 py-3"
                    >
                      <span className="flex-1 font-body text-sm text-foreground">
                        {item.designation}
                      </span>
                      <span className="w-12 flex-shrink-0 text-right font-body text-sm text-muted-foreground">
                        {item.quantity}
                      </span>
                      <span className="w-28 flex-shrink-0 text-right font-body text-sm text-muted-foreground">
                        {formatPrice(item.unitPrice)}
                      </span>
                      <span className="w-28 flex-shrink-0 text-right font-body text-sm font-medium text-foreground">
                        {formatPrice(item.quantity * item.unitPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : invoice.docType === 'QUOTE' && invoice.packs.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="font-body text-xs text-muted-foreground">
                    Offres au choix — chacune a son propre total, ce n&apos;est pas une somme.
                  </p>
                  <div className="flex flex-col gap-4">
                    {invoice.packs.map((pack, index) => (
                      <PackOfferCard
                        key={pack.id}
                        index={index + 1}
                        title={pack.title}
                        description={pack.description}
                        items={pack.items}
                        currency={invoice.currency}
                        selected={invoice.selectedPackId === pack.id}
                        depositType={pack.depositType}
                        depositValue={pack.depositValue}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="flex bg-secondary px-4 py-2.5 font-body text-xs font-semibold text-muted-foreground">
                    <span className="flex-1">Description</span>
                    <span className="w-28 flex-shrink-0 text-right">Total</span>
                  </div>
                  <div className="flex items-center px-4 py-3">
                    <span className="flex-1 font-body text-sm text-foreground">
                      {invoice.description ||
                        (invoice.project
                          ? invoice.project.name
                          : DOC_TYPE_LABELS[invoice.docType].long)}
                    </span>
                    <span className="w-28 flex-shrink-0 text-right font-body text-sm font-medium text-foreground">
                      {formatPrice(invoice.amount, invoice.currency)}
                    </span>
                  </div>
                </div>
              )}
              {!(invoice.docType === 'QUOTE' && invoice.packs.length > 0) && (
                <div className="mt-4 flex justify-end">
                  <div className="flex w-full max-w-[220px] items-center justify-between rounded-md bg-secondary px-4 py-2.5">
                    <span className="font-body text-xs font-semibold text-muted-foreground uppercase">
                      Total
                    </span>
                    <span className="font-headings text-base font-bold text-foreground">
                      {formatPrice(invoice.amount, invoice.currency)}
                    </span>
                  </div>
                </div>
              )}

              {invoice.docType === 'QUOTE' &&
                (user.bio || invoice.paymentTermsNote || invoice.contentBlocks.length > 0) && (
                  <div className="mt-6 flex flex-col gap-5 border-t border-border pt-6">
                    {user.bio && (
                      <div>
                        <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                          Votre présentation
                        </p>
                        <p className="mt-1.5 font-body text-sm whitespace-pre-wrap text-foreground">
                          {user.bio}
                        </p>
                      </div>
                    )}
                    {invoice.contentBlocks.filter((b) => b.kind === 'PROCESS').length > 0 && (
                      <div>
                        <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                          Étapes du projet
                        </p>
                        <ol className="mt-1.5 flex flex-col gap-2">
                          {invoice.contentBlocks
                            .filter((b) => b.kind === 'PROCESS')
                            .map((b, i) => (
                              <li key={b.id} className="font-body text-sm text-foreground">
                                <span className="font-medium">
                                  {i + 1}. {b.primaryText}
                                </span>
                                {b.secondaryText && (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {b.secondaryText}
                                  </span>
                                )}
                              </li>
                            ))}
                        </ol>
                      </div>
                    )}
                    {invoice.contentBlocks.filter((b) => b.kind === 'CONDITIONS').length > 0 && (
                      <div>
                        <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                          Conditions
                        </p>
                        <ol className="mt-1.5 flex flex-col gap-2">
                          {invoice.contentBlocks
                            .filter((b) => b.kind === 'CONDITIONS')
                            .map((b, i) => (
                              <li key={b.id} className="font-body text-sm text-foreground">
                                <span className="font-medium">
                                  {i + 1}. {b.primaryText}
                                </span>
                                {b.secondaryText && (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {b.secondaryText}
                                  </span>
                                )}
                              </li>
                            ))}
                        </ol>
                      </div>
                    )}
                    {(invoice.paymentTermsNote ||
                      invoice.contentBlocks.some((b) => b.kind === 'PAYMENT_METHOD')) && (
                      <div>
                        <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                          Modalités de paiement
                        </p>
                        {invoice.paymentTermsNote && (
                          <p className="mt-1.5 font-body text-sm text-foreground">
                            {invoice.paymentTermsNote}
                          </p>
                        )}
                        {invoice.contentBlocks.filter((b) => b.kind === 'PAYMENT_METHOD').length >
                          0 && (
                          <div className="mt-2 flex flex-col gap-1.5">
                            {invoice.contentBlocks
                              .filter((b) => b.kind === 'PAYMENT_METHOD')
                              .map((b) => (
                                <div
                                  key={b.id}
                                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                                >
                                  <span className="font-body text-sm font-medium text-foreground">
                                    {b.primaryText}
                                  </span>
                                  {b.secondaryText && (
                                    <span className="font-body text-sm text-muted-foreground">
                                      {b.secondaryText}
                                    </span>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                        <p className="mt-2 font-body text-xs text-muted-foreground">
                          À titre indicatif — aucun paiement en ligne n&apos;est traité à
                          l&apos;étape du devis.
                        </p>
                      </div>
                    )}
                    {invoice.contentBlocks.filter((b) => b.kind === 'FAQ').length > 0 && (
                      <div>
                        <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                          Questions fréquentes
                        </p>
                        <div className="mt-1.5 flex flex-col gap-3">
                          {invoice.contentBlocks
                            .filter((b) => b.kind === 'FAQ')
                            .map((b) => (
                              <div key={b.id}>
                                <p className="font-body text-sm font-medium text-foreground">
                                  {b.primaryText}
                                </p>
                                {b.secondaryText && (
                                  <p className="mt-0.5 font-body text-sm text-muted-foreground">
                                    {b.secondaryText}
                                  </p>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {(invoice.depositAmount != null ||
                invoice.paymentMethodNote ||
                invoice.deliveryDate) && (
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 font-body text-sm sm:grid-cols-4">
                  {invoice.depositAmount != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Acompte</p>
                      <p className="font-medium text-foreground">
                        {formatPrice(invoice.depositAmount, invoice.currency)}
                      </p>
                    </div>
                  )}
                  {invoice.depositAmount != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Solde</p>
                      <p className="font-medium text-foreground">
                        {formatPrice(
                          computeBalance(invoice.amount, invoice.depositAmount),
                          invoice.currency,
                        )}
                      </p>
                    </div>
                  )}
                  {invoice.paymentMethodNote && (
                    <div>
                      <p className="text-xs text-muted-foreground">Règlement</p>
                      <p className="font-medium text-foreground">{invoice.paymentMethodNote}</p>
                    </div>
                  )}
                  {invoice.deliveryDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">Livraison</p>
                      <p className="font-medium text-foreground">
                        {formatDate(invoice.deliveryDate)}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {invoice.footerNote && (
                <p className="mt-4 border-t border-border pt-4 font-body text-xs text-muted-foreground italic">
                  {invoice.footerNote}
                </p>
              )}

              {invoice.docType === 'CREDIT_NOTE' && invoice.relatedInvoice && (
                <p className="mt-4 font-body text-sm text-muted-foreground">
                  Cet avoir annule la facture{' '}
                  <Link
                    href={`/invoices/${invoice.relatedInvoice.id}`}
                    className="font-medium text-primary"
                  >
                    {invoice.relatedInvoice.number}
                  </Link>
                  .
                </p>
              )}
              {invoice.creditNote && (
                <p className="mt-4 font-body text-sm text-muted-foreground">
                  Cette facture est annulée par l&apos;avoir{' '}
                  <Link
                    href={`/invoices/${invoice.creditNote.id}`}
                    className="font-medium text-primary"
                  >
                    {invoice.creditNote.number}
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>

          {/* Right: status + actions */}
          <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1 print:hidden">
            <div className="rounded-lg border border-border bg-canvas p-5 shadow-card">
              <p className="mb-3 font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                Statut
              </p>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${INVOICE_STATUS_COLORS[invoice.status].bg} ${INVOICE_STATUS_COLORS[invoice.status].fg}`}
              >
                <Icon i={INVOICE_STATUS_COLORS[invoice.status].icon} size={12} />
                {INVOICE_STATUS_LABELS[invoice.status]}
              </span>
              <dl className="mt-4 flex flex-col gap-2.5 font-body text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Référence</dt>
                  <dd className="font-medium text-foreground">{invoice.number}</dd>
                </div>
                {invoice.project && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Projet</dt>
                    <dd className="min-w-0 truncate font-medium text-foreground">
                      <Link href={`/projects/${invoice.project.id}`} className="hover:text-primary">
                        {invoice.project.name}
                      </Link>
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                  <dt className="text-muted-foreground">Montant</dt>
                  <dd className="font-semibold text-foreground">
                    {formatPrice(invoice.amount, invoice.currency)}
                  </dd>
                </div>
              </dl>
              {invoice.docType !== 'CREDIT_NOTE' && invoice.status !== 'DRAFT' && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                    Lien client
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyClientLink()}
                    aria-label="Copier le lien client"
                    className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-left hover:border-primary/40"
                  >
                    <Icon i="link" size={13} className="flex-shrink-0 text-muted-foreground" />
                    <span className="truncate font-body text-xs text-muted-foreground">
                      /suivi/{invoice.trackingToken}
                    </span>
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={sendClientLinkViaWhatsApp}
                      className="flex items-center justify-center gap-1.5 rounded-md bg-tag-green px-3 py-2 font-body text-xs font-medium text-tag-green-fg hover:opacity-90"
                    >
                      <Icon i="message-circle" size={14} />
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={openClientLink}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 font-body text-xs font-medium text-foreground hover:border-primary/40"
                    >
                      <Icon i="external-link" size={14} />
                      Ouvrir
                    </button>
                  </div>
                </div>
              )}
            </div>

            {invoice.docType !== 'CREDIT_NOTE' && invoice.status !== 'CANCELED' && (
              <div className="rounded-lg border border-border bg-canvas p-5 shadow-card">
                <div className="mb-3 flex items-center gap-1.5">
                  <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                    Actions
                  </p>
                </div>

                {invoice.docType === 'QUOTE' &&
                  invoice.status === 'ACCEPTED' &&
                  !invoice.project && (
                    <div className="mb-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCreatingProjectOpen(true)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground"
                      >
                        <Icon i="folder-open" size={15} />
                        Créer un projet depuis ce devis
                      </button>
                      <InfoTooltip text="Pré-remplit un nouveau projet avec le client et le montant de ce devis — tous les champs restent modifiables avant de valider." />
                    </div>
                  )}

                {invoice.docType !== 'QUOTE' && invoice.status !== 'PAID' && (
                  <div className="mb-3 flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={changingStatus !== null}
                      onClick={() => setConfirmingPaid(true)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-tag-green px-4 py-2.5 font-body text-sm font-medium text-tag-green-fg disabled:opacity-50"
                    >
                      <Icon i={changingStatus === 'PAID' ? 'loader' : 'check-circle'} size={15} />
                      {changingStatus === 'PAID' ? 'Enregistrement…' : 'Marquer comme payée'}
                    </button>
                    <InfoTooltip text="Enregistre cette facture comme payée (ex : espèces, virement ou Mobile Money reçu hors plateforme). Ne vérifie pas automatiquement le paiement." />
                  </div>
                )}

                {invoice.docType !== 'QUOTE' && invoice.status === 'PAID' && (
                  <div className="mb-3 flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={changingStatus !== null}
                      onClick={() => void changeStatus('SENT')}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
                    >
                      <Icon i={changingStatus === 'SENT' ? 'loader' : 'x-circle'} size={15} />
                      {changingStatus === 'SENT' ? 'Enregistrement…' : 'Marquer comme non payée'}
                    </button>
                    <InfoTooltip text="Annule le paiement enregistré et repasse la facture à l'état envoyée — si elle est liée à un projet, l'acompte et le solde redeviennent à régler sur le suivi client." />
                  </div>
                )}

                <div className="mb-4">
                  <p className="mb-1.5 font-body text-xs text-muted-foreground">Autre statut</p>
                  <div className="flex flex-wrap gap-1.5">
                    {OTHER_STATUSES.filter((s) => s !== invoice.status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={changingStatus !== null}
                        onClick={() => void changeStatus(s)}
                        className="rounded-full border border-border bg-canvas px-2.5 py-1 font-body text-xs font-medium text-foreground disabled:opacity-50"
                      >
                        {changingStatus === s ? '…' : INVOICE_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={invoice.status !== 'DRAFT'}
                      onClick={() =>
                        invoice.docType === 'QUOTE'
                          ? router.push(`/invoices/${invoice.id}/edit-quote`)
                          : setEditOpen(true)
                      }
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-40"
                    >
                      <Icon i="pen-line" size={14} />
                      {invoice.docType === 'QUOTE' ? 'Modifier le devis' : 'Modifier la facture'}
                    </button>
                    <InfoTooltip text="Modification possible uniquement au statut Brouillon, pour ne jamais changer une facture déjà envoyée au client." />
                  </div>

                  {invoice.docType === 'INVOICE' && !invoice.creditNote && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmingCreditNote(true)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground"
                      >
                        <Icon i="file-clock" size={14} />
                        Émettre un avoir
                      </button>
                      <InfoTooltip text="Crée un document qui annule intégralement cette facture (même montant) et la marque « Annulée ». C'est la seule façon de corriger une erreur une fois la facture émise — aucune facture n'est jamais supprimée après envoi." />
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={invoice.status !== 'DRAFT'}
                      onClick={() => setConfirmingDelete(true)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-tag-red-fg px-4 py-2.5 font-body text-sm font-medium text-tag-red-fg disabled:opacity-40"
                    >
                      <Icon i="trash" size={14} />
                      Supprimer
                    </button>
                    <InfoTooltip text="Suppression définitive, possible uniquement tant que la facture est un brouillon jamais envoyé. Une fois envoyée, seul un avoir permet de l'annuler." />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {invoice && editOpen && (
        <Modal title="Modifier la facture" onClose={() => setEditOpen(false)} size="lg">
          <InvoiceForm
            invoice={{
              id: invoice.id,
              clientId: invoice.client.id,
              projectId: invoice.project?.id ?? null,
              description: invoice.description,
              amount: invoice.amount,
              currency: invoice.currency,
              dueDate: invoice.dueDate,
              lineItems: invoice.lineItems.map((it) => ({
                designation: it.designation,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
              })),
              depositAmount: invoice.depositAmount,
              deliveryDate: invoice.deliveryDate,
              paymentMethodNote: invoice.paymentMethodNote,
              footerNote: invoice.footerNote,
            }}
            onDone={() => {
              setEditOpen(false);
              void refresh();
            }}
            onNeedClient={() => {}}
          />
        </Modal>
      )}

      {invoice && creatingProjectOpen && (
        <Modal title="Créer un projet depuis ce devis" onClose={closeCreatingProject}>
          {depositChoice === null && (
            <div className="flex flex-col gap-4">
              <p className="font-body text-sm text-muted-foreground">
                L&apos;acompte de ce devis a-t-il déjà été reçu ?
              </p>
              <div className="rounded-md border border-border bg-secondary/30 px-3 py-2.5 font-body text-sm text-foreground">
                Acompte estimé{packDepositType === 'PERCENT' ? ` (${packDepositValue}%)` : ''} :{' '}
                {formatPrice(estimatedDeposit, invoice.currency)}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setDepositChoice('RECEIVED');
                    setDepositAmount(String(estimatedDeposit));
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground"
                >
                  Acompte reçu
                </button>
                <button
                  type="button"
                  onClick={() => setDepositChoice('NOT_RECEIVED')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground"
                >
                  Acompte non reçu
                </button>
              </div>
            </div>
          )}

          {depositChoice === 'RECEIVED' && !depositStepDone && (
            <div className="flex flex-col gap-4">
              <p className="font-body text-sm text-muted-foreground">
                Indique le montant réellement reçu (ajuste-le si le client n&apos;a versé
                qu&apos;une partie de l&apos;acompte) et le moyen de paiement utilisé.
              </p>
              <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                Montant reçu ({invoice.currency})
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="rounded-md border border-border bg-input px-3 py-2.5 font-body text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none"
                />
              </label>
              <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                Moyen de paiement utilisé
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHODS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDepositPaymentMethod(value)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        depositPaymentMethod === value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-canvas text-foreground'
                      }`}
                    >
                      {PAYMENT_METHOD_LABELS[value]}
                    </button>
                  ))}
                </div>
                {depositPaymentMethod === 'OTHER' && (
                  <input
                    type="text"
                    autoFocus
                    value={depositPaymentMethodOther}
                    onChange={(e) => setDepositPaymentMethodOther(e.target.value)}
                    placeholder="Précisez le moyen utilisé…"
                    maxLength={100}
                    className="mt-1 rounded-md border border-border bg-input px-3 py-2.5 font-body text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none"
                  />
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDepositChoice(null)}
                  className="font-body text-sm text-muted-foreground underline"
                >
                  Retour
                </button>
                <button
                  type="button"
                  disabled={
                    !depositAmount ||
                    Number(depositAmount) <= 0 ||
                    Number(depositAmount) > invoice.amount ||
                    !depositPaymentMethod ||
                    (depositPaymentMethod === 'OTHER' && !depositPaymentMethodOther.trim())
                  }
                  onClick={() => setDepositStepDone(true)}
                  className="ml-auto rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Continuer
                </button>
              </div>
            </div>
          )}

          {depositChoice === 'NOT_RECEIVED' && !depositStepDone && (
            <div className="flex flex-col gap-4">
              <p className="font-body text-sm text-muted-foreground">
                Continuer et créer le projet sans acompte ?
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDepositChoice(null)}
                  className="font-body text-sm text-muted-foreground underline"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => setDepositStepDone(true)}
                  className="ml-auto rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground"
                >
                  Continuer
                </button>
              </div>
            </div>
          )}

          {depositStepDone && (
            <ProjectForm
              lockedClient={{ id: invoice.client.id, label: invoice.client.name }}
              initial={{
                name: invoice.description || selectedPack?.title || '',
                ...(selectedPack?.description ? { description: selectedPack.description } : {}),
                ...(invoice.sector ? { sector: invoice.sector } : {}),
                ...(invoice.type ? { type: invoice.type as ProjectType } : {}),
                amount: invoice.amount,
                currency: invoice.currency,
                depositType: packDepositType,
                depositValue: packDepositValue,
              }}
              submitPath={`/api/invoices/${invoice.id}/create-project`}
              extraBody={
                depositChoice === 'RECEIVED'
                  ? {
                      depositReceived: true,
                      depositAmount: Number(depositAmount),
                      paymentMethod: depositPaymentMethod,
                      ...(depositPaymentMethod === 'OTHER'
                        ? { paymentMethodLabel: depositPaymentMethodOther.trim() }
                        : {}),
                    }
                  : { depositReceived: false }
              }
              onDone={() => {
                closeCreatingProject();
                invalidateCachePrefix('/api/invoices');
                void refresh();
              }}
              onNeedClient={() => {}}
            />
          )}
        </Modal>
      )}

      {invoice && confirmingPaid && (
        <Modal title="Marquer comme payée ?" onClose={() => setConfirmingPaid(false)}>
          <p className="font-body text-sm text-muted-foreground">
            Cette action enregistre {formatPrice(invoice.amount, invoice.currency)} comme
            intégralement réglés.
            {invoice.project && (
              <>
                {' '}
                Sur la page de suivi du projet « {invoice.project.name} », l&apos;acompte{' '}
                <strong>et</strong> le solde seront marqués comme payés.
              </>
            )}{' '}
            Vous pourrez annuler cette action à tout moment.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingPaid(false)}
              className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => {
                void changeStatus('PAID');
                setConfirmingPaid(false);
              }}
              disabled={changingStatus !== null}
              className="rounded-md bg-tag-green px-4 py-2 font-body text-sm font-medium text-tag-green-fg disabled:opacity-50"
            >
              Confirmer
            </button>
          </div>
        </Modal>
      )}

      {invoice && confirmingCreditNote && (
        <Modal title="Émettre un avoir" onClose={() => setConfirmingCreditNote(false)}>
          <p className="font-body text-sm text-muted-foreground">
            Un avoir de {formatPrice(invoice.amount, invoice.currency)} sera créé pour annuler la
            facture {invoice.number}. Cette action est irréversible.
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

      {invoice && confirmingDelete && (
        <Modal title="Supprimer le brouillon" onClose={() => setConfirmingDelete(false)}>
          <p className="font-body text-sm text-muted-foreground">
            Le brouillon {invoice.number} sera définitivement supprimé. Cette action est
            irréversible.
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
              onClick={() => void deleteInvoice()}
              disabled={deleting}
              className="rounded-md bg-tag-red-fg px-4 py-2 font-body text-sm font-medium text-white disabled:opacity-50"
            >
              {deleting ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
