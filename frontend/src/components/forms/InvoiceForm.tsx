'use client';

// INVOICE-only — a devis (QUOTE) is created/edited via the dedicated
// /invoices/new-quote and /invoices/[id]/edit-quote pages
// (QuoteBuilderForm.tsx), not this modal. Its multi-pack builder doesn't fit
// the Modal's max-w-3xl/max-h-[90vh] constraints, and a devis' `packs` shape
// is structurally different enough from a facture's flat `lineItems` that
// sharing one form would mean branching almost every field.
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { formatPrice, formatDate } from '@/lib/utils';
import { computeItemsTotal, computeBalance } from '@/lib/invoiceTotals';
import { resolveDocumentIdentity } from '@/lib/documentIdentity';
import { PlanLimitPrompt, isPlanLimitCode } from '@/components/ui/PlanLimitPrompt';
import { Icon } from '@/components/ui/Icon';
import { DatePicker } from '@/components/ui/DatePicker';
import { CURRENCIES } from '@/lib/constants';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

interface ClientOption {
  id: string;
  code: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
}

interface LineItemDraft {
  designation: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceFormExisting {
  id: string;
  clientId: string;
  projectId: string | null;
  description: string | null;
  amount: number;
  currency: string;
  issueDate: string;
  overdueAfterDays: number;
  lineItems: { designation: string; quantity: number; unitPrice: number }[];
  depositAmount: number | null;
  deliveryDate: string | null;
  paymentMethodNote: string | null;
  footerNote: string | null;
}

export interface InvoiceFormInitial {
  description?: string;
  lineItems?: { designation: string; quantity: number; unitPrice: number }[];
  currency?: string;
  depositAmount?: number;
}

function defaultLineItems(
  invoice?: InvoiceFormExisting,
  initial?: InvoiceFormInitial,
): LineItemDraft[] {
  if (invoice) {
    if (invoice.lineItems.length > 0) {
      return invoice.lineItems.map((it) => ({
        designation: it.designation,
        quantity: String(it.quantity),
        unitPrice: String(it.unitPrice),
      }));
    }
    // Backward-compat: a legacy invoice created before line items existed —
    // seed one row from its flat description/amount so the subtotal starts
    // matching what was already there instead of an empty state.
    return [
      { designation: invoice.description ?? '', quantity: '1', unitPrice: String(invoice.amount) },
    ];
  }
  if (initial?.lineItems && initial.lineItems.length > 0) {
    return initial.lineItems.map((it) => ({
      designation: it.designation,
      quantity: String(it.quantity),
      unitPrice: String(it.unitPrice),
    }));
  }
  return [{ designation: '', quantity: '1', unitPrice: '' }];
}

export function InvoiceForm({
  invoice,
  onDone,
  onNeedClient,
  initial,
  lockedClient,
  lockedProject,
  submitPath = '/api/invoices',
}: {
  invoice?: InvoiceFormExisting;
  onDone: () => void;
  onNeedClient: () => void;
  /** Pre-fills the form — e.g. from a project. Every field stays editable;
   *  this only seeds the initial values, same as a user typing them in. */
  initial?: InvoiceFormInitial;
  /** When set, the client picker is replaced by a read-only label and
   *  `clientId` is never included in the submitted body — the target route
   *  derives it itself, so a tampered request can't attach the invoice to a
   *  different client. */
  lockedClient?: { id: string; label: string };
  /** Same idea as `lockedClient`, for the optional project link — replaces
   *  the "Projet lié" picker with a read-only label and omits `projectId`
   *  from the body. */
  lockedProject?: { id: string; label: string };
  /** Defaults to the standalone creation endpoint; pass a different path to
   *  reuse this exact form for a specialized creation flow. */
  submitPath?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: clientsData, loading: clientsLoading } = useApi<{ items: ClientOption[] }>(
    '/api/clients?limit=50',
  );
  const clients = clientsData?.items ?? [];

  const [clientId, setClientId] = useState(lockedClient?.id ?? invoice?.clientId ?? '');
  const { data: projectsData } = useApi<{ items: ProjectOption[] }>(
    `/api/projects?clientId=${clientId}&limit=50`,
    { skip: !clientId || !!lockedProject },
  );
  const projects = projectsData?.items ?? [];
  const { data: clientDetail } = useApi<{
    invoices: { docType: string; status: string; amount: number; projectId: string | null }[];
    projects: { id: string; name: string }[];
  }>(`/api/clients/${clientId}`, { skip: !clientId });
  const clientTotalBilled = (clientDetail?.invoices ?? [])
    .filter((inv) => inv.docType === 'INVOICE' && inv.status !== 'CANCELED')
    .reduce((sum, inv) => sum + inv.amount, 0);

  // Heads-up only, never a blocker: catches the case where the freelance
  // uses the standalone "Nouvelle facture" form for a client that already
  // has a project with no facture yet, forgetting the dedicated "Créer
  // facture depuis projet" flow on that project's own page. Skipped
  // entirely when lockedProject is set — that IS the dedicated flow.
  const billedProjectIds = new Set(
    (clientDetail?.invoices ?? [])
      .filter((inv) => inv.docType === 'INVOICE' && inv.projectId)
      .map((inv) => inv.projectId as string),
  );
  const unbilledProject = (clientDetail?.projects ?? []).find((p) => !billedProjectIds.has(p.id));

  const [projectId, setProjectId] = useState(lockedProject?.id ?? invoice?.projectId ?? '');
  const [description, setDescription] = useState(
    invoice?.description ?? initial?.description ?? '',
  );
  const [currency, setCurrency] = useState(invoice?.currency ?? initial?.currency ?? 'XOF');
  const [issueDate, setIssueDate] = useState(
    invoice?.issueDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [overdueAfterDays, setOverdueAfterDays] = useState(
    invoice?.overdueAfterDays != null ? String(invoice.overdueAfterDays) : '5',
  );

  const [lineItems, setLineItems] = useState<LineItemDraft[]>(() =>
    defaultLineItems(invoice, initial),
  );
  const [depositAmount, setDepositAmount] = useState(
    invoice?.depositAmount != null
      ? String(invoice.depositAmount)
      : initial?.depositAmount != null
        ? String(initial.depositAmount)
        : '',
  );
  const [importingProject, setImportingProject] = useState(false);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);

  // Same field-seeding as the dedicated "Créer facture depuis projet" flow,
  // but inline: fetches the project and fills the already-open form instead
  // of navigating away. Also links projectId — unlike the ProjectForm side
  // of this pattern, InvoiceForm's own submit path natively supports it.
  async function importFromProject() {
    if (!unbilledProject) return;
    setImportingProject(true);
    try {
      const data = await api<{
        project: {
          id: string;
          name: string;
          amount: number;
          currency: string;
        };
        deposit: { amount: number; paid: boolean };
      }>(`/api/projects/${unbilledProject.id}`);
      setProjectId(data.project.id);
      setDescription(data.project.name);
      setLineItems([
        { designation: data.project.name, quantity: '1', unitPrice: String(data.project.amount) },
      ]);
      setCurrency(data.project.currency);
      if (data.deposit.paid) setDepositAmount(String(data.deposit.amount));
      setImportedProjectId(data.project.id);
      toast('Données du projet importées.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Impossible d'importer les données.", 'error');
    } finally {
      setImportingProject(false);
    }
  }
  const [deliveryDate, setDeliveryDate] = useState(
    invoice?.deliveryDate ? invoice.deliveryDate.slice(0, 10) : '',
  );
  const [paymentMethodNote, setPaymentMethodNote] = useState(invoice?.paymentMethodNote ?? '');
  // A new facture pre-fills footerNote from the freelance's default legal
  // mention (Paramètres → Compte) — stays freely editable per invoice, and
  // an existing invoice's own saved footerNote always wins.
  const [footerNote, setFooterNote] = useState(
    invoice?.footerNote ?? user?.defaultLegalMention ?? '',
  );

  const [error, setError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [lineItemsError, setLineItemsError] = useState<string | null>(null);
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const clientRef = useRef<HTMLSelectElement>(null);
  const lineItemsRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find((c) => c.id === clientId);
  const studioLabel = user ? resolveDocumentIdentity(user).name : '';

  function updateLineItem(index: number, field: keyof LineItemDraft, value: string) {
    setLineItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
    if (lineItemsError) setLineItemsError(null);
  }
  function addLineItem() {
    setLineItems((prev) => [...prev, { designation: '', quantity: '1', unitPrice: '' }]);
  }
  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  const numericLineItems = lineItems.map((it) => ({
    quantity: Number(it.quantity) || 0,
    unitPrice: Number(it.unitPrice) || 0,
  }));
  const lineItemsTotal = computeItemsTotal(numericLineItems);
  const depositValue = depositAmount ? Number(depositAmount) : null;
  const balance = computeBalance(lineItemsTotal, depositValue);
  const previewDueDate = new Date(
    new Date(issueDate).getTime() + (Number(overdueAfterDays) || 5) * 24 * 60 * 60 * 1000,
  );

  function buildLineItemsPayload():
    | { designation: string; quantity: number; unitPrice: number }[]
    | null {
    const items = lineItems
      .map((it) => ({
        designation: it.designation.trim(),
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
      }))
      .filter((it) => it.designation && it.quantity > 0 && it.unitPrice > 0);
    if (items.length === 0) {
      setLineItemsError(
        'Ajoutez au moins une ligne de prestation (désignation, quantité et prix).',
      );
      return null;
    }
    return items;
  }

  async function saveInvoice(targetStatus: 'DRAFT' | 'SENT') {
    setClientError(null);
    setLineItemsError(null);
    if (!lockedClient && !clientId) {
      setClientError('Sélectionnez un client.');
      clientRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      clientRef.current?.focus();
      return;
    }
    const items = buildLineItemsPayload();
    if (!items) {
      lineItemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    setError(null);
    setPlanLimitMessage(null);
    try {
      const shared = {
        ...(lockedClient ? {} : { clientId }),
        ...(lockedProject ? {} : { projectId: projectId || null }),
        description: description || null,
        lineItems: items,
        currency,
        issueDate: new Date(issueDate).toISOString(),
        overdueAfterDays: Number(overdueAfterDays) || 5,
        depositAmount: depositAmount ? Number(depositAmount) : null,
        deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : null,
        paymentMethodNote: paymentMethodNote || null,
        footerNote: footerNote || null,
        status: targetStatus,
      };
      if (invoice) {
        await api(`/api/invoices/${invoice.id}`, { method: 'PATCH', body: shared });
        invalidateCachePrefix('/api/invoices');
        invalidateCachePrefix(`/api/invoices/${invoice.id}`);
        toast(
          targetStatus === 'SENT' ? 'Facture prête à envoyer.' : 'Brouillon enregistré.',
          'success',
        );
      } else {
        await api(submitPath, {
          method: 'POST',
          body: { ...shared, docType: 'INVOICE' },
        });
        invalidateCachePrefix('/api/invoices');
        invalidateCachePrefix('/api/dashboard/stats');
        toast(
          targetStatus === 'SENT' ? 'Facture prête à envoyer.' : 'Brouillon enregistré.',
          'success',
        );
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError && isPlanLimitCode(err.code)) {
        const detail = err.body.message;
        setPlanLimitMessage(typeof detail === 'string' ? detail : err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void saveInvoice('DRAFT');
  }

  if (!lockedClient && !clientsLoading && clients.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-body text-sm text-muted-foreground">
          Vous devez d&apos;abord ajouter un client avant de créer une facture.
        </p>
        <button
          type="button"
          onClick={onNeedClient}
          className="rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground"
        >
          Ajouter un client
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <form onSubmit={onSubmit} className="flex min-w-0 flex-1 flex-col gap-4">
        {!invoice && (
          <p className="-mb-1 font-body text-xs text-muted-foreground">
            Conseil : un devis accepté au préalable évite les malentendus et vous protège
            juridiquement.
          </p>
        )}
        {lockedClient ? (
          <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Client
            <p className={`${inputClass} bg-secondary/50 text-muted-foreground`}>
              {lockedClient.label}
            </p>
          </div>
        ) : (
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Client *
            <select
              ref={clientRef}
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setProjectId('');
                if (clientError) setClientError(null);
              }}
              aria-invalid={!!clientError}
              className={
                clientError
                  ? `${inputClass} border-tag-red-fg focus:ring-tag-red-fg/40`
                  : inputClass
              }
            >
              <option value="" disabled>
                Sélectionner un client
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            {clientError && (
              <span role="alert" className="font-body text-xs font-normal text-tag-red-fg">
                {clientError}
              </span>
            )}
          </label>
        )}
        {!lockedProject && unbilledProject && unbilledProject.id !== importedProjectId && (
          <div className="flex items-start gap-2 rounded-lg bg-tag-orange p-3">
            <Icon i="alert-circle" size={16} className="mt-0.5 flex-shrink-0 text-tag-orange-fg" />
            <div className="flex flex-col gap-1">
              <p className="font-body text-sm text-tag-orange-fg">
                {`Ce client a un projet (${unbilledProject.name}) sans facture. Utilise « Créer facture depuis projet » pour la générer avec le bon montant.`}
              </p>
              <div className="flex items-center gap-3">
                <Link
                  href={`/projects/${unbilledProject.id}`}
                  onClick={onDone}
                  className="self-start font-body text-xs font-semibold text-tag-orange-fg underline"
                >
                  Voir le projet
                </Link>
                <button
                  type="button"
                  onClick={() => void importFromProject()}
                  disabled={importingProject}
                  className="self-start font-body text-xs font-semibold text-tag-orange-fg underline disabled:opacity-50"
                >
                  {importingProject ? 'Import…' : 'Importer les données'}
                </button>
              </div>
            </div>
          </div>
        )}
        {lockedProject ? (
          <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Projet lié
            <p className={`${inputClass} bg-secondary/50 text-muted-foreground`}>
              {lockedProject.label}
            </p>
          </div>
        ) : (
          clientId &&
          projects.length > 0 && (
            <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
              Projet lié (optionnel)
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputClass}
              >
                <option value="">Aucun</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )
        )}
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Description
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>
        <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Devise
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCurrency(c.value)}
                title={c.label}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  currency === c.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-canvas text-foreground'
                }`}
              >
                {c.value}
              </button>
            ))}
          </div>
        </div>

        <div ref={lineItemsRef} className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Prestations *
          <div className="flex flex-col gap-2">
            {lineItems.map((item, index) => (
              <div
                key={index}
                className={`flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center ${
                  lineItemsError ? 'border-tag-red-fg' : 'border-border'
                }`}
              >
                <input
                  type="text"
                  placeholder="Désignation"
                  value={item.designation}
                  onChange={(e) => updateLineItem(index, 'designation', e.target.value)}
                  maxLength={200}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Qté"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                    className={`${inputClass} w-16 flex-shrink-0`}
                  />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder={`Prix (${currency})`}
                    value={item.unitPrice}
                    onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                    className={`${inputClass} w-28 flex-shrink-0`}
                  />
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    disabled={lineItems.length <= 1}
                    aria-label="Retirer cette ligne"
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30"
                  >
                    <Icon i="trash" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addLineItem}
            className="mt-1 flex w-fit items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <Icon i="plus" size={13} />
            Ajouter une ligne
          </button>
          {lineItemsError && (
            <span role="alert" className="font-body text-xs font-normal text-tag-red-fg">
              {lineItemsError}
            </span>
          )}
          <p className="mt-1 flex items-center justify-between font-body text-sm font-semibold text-foreground">
            Sous-total
            <span>{formatPrice(lineItemsTotal, currency)}</span>
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Acompte ({currency})
            <input
              type="number"
              min={0}
              step={1}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Solde ({currency})
            <input
              type="text"
              disabled
              value={formatPrice(balance, '')}
              className={`${inputClass} cursor-not-allowed opacity-70`}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Règlement (moyen de paiement)
          <input
            type="text"
            placeholder="Ex : Orange Money +221…"
            value={paymentMethodNote}
            onChange={(e) => setPaymentMethodNote(e.target.value)}
            maxLength={300}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Date de livraison
          <DatePicker value={deliveryDate} onChange={setDeliveryDate} />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Note de bas de page
          <input
            type="text"
            placeholder="Ex : Merci pour votre confiance !"
            value={footerNote}
            onChange={(e) => setFooterNote(e.target.value)}
            maxLength={1000}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Date facture
          <DatePicker value={issueDate} onChange={setIssueDate} />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Jours avant retard
          <input
            type="number"
            min={1}
            step={1}
            value={overdueAfterDays}
            onChange={(e) => setOverdueAfterDays(e.target.value)}
            className={`${inputClass} max-w-[100px]`}
          />
          <span className="font-body text-xs text-muted-foreground">
            Passe automatiquement en retard si non payée après ce délai.
          </span>
        </label>
        {planLimitMessage && <PlanLimitPrompt message={planLimitMessage} />}
        {error && (
          <p role="alert" className="font-body text-sm text-tag-red-fg">
            {error}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void saveInvoice('DRAFT')}
            disabled={submitting}
            className="rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
          >
            Enregistrer brouillon
          </button>
          <button
            type="button"
            onClick={() => void saveInvoice('SENT')}
            disabled={submitting}
            className="rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Enregistrement…' : 'Prêt à envoyer'}
          </button>
        </div>
      </form>

      <div className="lg:sticky lg:top-0 lg:w-64 lg:flex-shrink-0 lg:self-start">
        <p className="mb-2 font-body text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Aperçu en direct
        </p>
        <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border bg-secondary/40 p-4 font-body">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-headings text-sm font-bold text-foreground">Facture</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {invoice ? 'Numéro déjà attribué' : 'Numéro attribué à la création'}
              </p>
            </div>
            <p className="flex-shrink-0 text-[11px] text-muted-foreground">
              {formatDate(new Date().toISOString())}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">De</p>
            <p className="truncate text-sm font-medium text-foreground">{studioLabel || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Pour</p>
            <p className="truncate text-sm font-medium text-foreground">
              {lockedClient
                ? lockedClient.label
                : selectedClient
                  ? `${selectedClient.code} — ${selectedClient.name}`
                  : 'Sélectionnez un client'}
            </p>
            {selectedClient && clientTotalBilled > 0 && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Déjà facturé à ce client : {formatPrice(clientTotalBilled, currency)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {lineItems
              .filter((it) => it.designation.trim())
              .map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-foreground">
                    {it.designation} × {it.quantity || 0}
                  </p>
                  <p className="flex-shrink-0 text-xs font-medium text-foreground">
                    {formatPrice((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), '')}
                  </p>
                </div>
              ))}
            <div className="flex items-start justify-between gap-2 border-t border-border pt-2">
              <p className="text-sm font-semibold text-foreground">Total</p>
              <p className="flex-shrink-0 text-sm font-semibold text-foreground">
                {formatPrice(lineItemsTotal, currency)}
              </p>
            </div>
            {depositValue !== null && depositValue > 0 && (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">Acompte</p>
                  <p className="flex-shrink-0 text-[11px] text-muted-foreground">
                    {formatPrice(depositValue, currency)}
                  </p>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium text-foreground">Reste</p>
                  <p className="flex-shrink-0 text-[11px] font-medium text-foreground">
                    {formatPrice(balance, currency)}
                  </p>
                </div>
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            En retard à partir du {formatDate(previewDueDate.toISOString())}
          </p>
        </div>
      </div>

      {/* Mobile only — the desktop sidebar above is sticky on its own, but on
          mobile it sits below a potentially long form, so pin a compact
          Total/Acompte/Reste strip to the bottom of the modal instead of
          losing the running total once the fields scroll past it. */}
      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t border-border bg-canvas/95 px-4 py-3 shadow-xl backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 font-body">
          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Total</p>
            <p className="text-base font-bold text-foreground">
              {formatPrice(lineItemsTotal, currency)}
            </p>
          </div>
          {depositValue !== null && depositValue > 0 && (
            <div className="text-center">
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Acompte</p>
              <p className="text-sm font-semibold text-foreground">
                {formatPrice(depositValue, currency)}
              </p>
            </div>
          )}
          {depositValue !== null && depositValue > 0 && (
            <div className="text-right">
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Reste</p>
              <p className="text-base font-bold text-foreground">
                {formatPrice(balance, currency)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
