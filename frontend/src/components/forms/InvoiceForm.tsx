'use client';

// INVOICE-only — a devis (QUOTE) is created/edited via the dedicated
// /invoices/new-quote and /invoices/[id]/edit-quote pages
// (QuoteBuilderForm.tsx), not this modal. Its multi-pack builder doesn't fit
// the Modal's max-w-3xl/max-h-[90vh] constraints, and a devis' `packs` shape
// is structurally different enough from a facture's flat `lineItems` that
// sharing one form would mean branching almost every field.
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { formatPrice, formatDate } from '@/lib/utils';
import { computeItemsTotal, computeBalance } from '@/lib/invoiceTotals';
import { PlanLimitPrompt, isPlanLimitCode } from '@/components/ui/PlanLimitPrompt';
import { Icon } from '@/components/ui/Icon';
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
  dueDate: string | null;
  lineItems: { designation: string; quantity: number; unitPrice: number }[];
  depositAmount: number | null;
  deliveryDate: string | null;
  paymentMethodNote: string | null;
  footerNote: string | null;
}

function defaultLineItems(invoice?: InvoiceFormExisting): LineItemDraft[] {
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
  return [{ designation: '', quantity: '1', unitPrice: '' }];
}

export function InvoiceForm({
  invoice,
  onDone,
  onNeedClient,
}: {
  invoice?: InvoiceFormExisting;
  onDone: () => void;
  onNeedClient: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: clientsData, loading: clientsLoading } = useApi<{ items: ClientOption[] }>(
    '/api/clients?limit=50',
  );
  const clients = clientsData?.items ?? [];

  const [clientId, setClientId] = useState(invoice?.clientId ?? '');
  const { data: projectsData } = useApi<{ items: ProjectOption[] }>(
    `/api/projects?clientId=${clientId}&limit=50`,
    { skip: !clientId },
  );
  const projects = projectsData?.items ?? [];

  const [projectId, setProjectId] = useState(invoice?.projectId ?? '');
  const [description, setDescription] = useState(invoice?.description ?? '');
  const [currency, setCurrency] = useState(invoice?.currency ?? 'XOF');
  const [dueDate, setDueDate] = useState(invoice?.dueDate ? invoice.dueDate.slice(0, 10) : '');

  const [lineItems, setLineItems] = useState<LineItemDraft[]>(() => defaultLineItems(invoice));
  const [depositAmount, setDepositAmount] = useState(
    invoice?.depositAmount != null ? String(invoice.depositAmount) : '',
  );
  const [deliveryDate, setDeliveryDate] = useState(
    invoice?.deliveryDate ? invoice.deliveryDate.slice(0, 10) : '',
  );
  const [paymentMethodNote, setPaymentMethodNote] = useState(invoice?.paymentMethodNote ?? '');
  const [footerNote, setFooterNote] = useState(invoice?.footerNote ?? '');

  const [error, setError] = useState<string | null>(null);
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const studioLabel = user?.studioName || user?.email || '';

  function updateLineItem(index: number, field: keyof LineItemDraft, value: string) {
    setLineItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
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
      setError('Ajoutez au moins une ligne de prestation (désignation, quantité et prix).');
      return null;
    }
    return items;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setPlanLimitMessage(null);
    try {
      const items = buildLineItemsPayload();
      if (!items) {
        setSubmitting(false);
        return;
      }
      const shared = {
        clientId,
        projectId: projectId || null,
        description: description || null,
        lineItems: items,
        currency,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        depositAmount: depositAmount ? Number(depositAmount) : null,
        deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : null,
        paymentMethodNote: paymentMethodNote || null,
        footerNote: footerNote || null,
      };
      if (invoice) {
        await api(`/api/invoices/${invoice.id}`, { method: 'PATCH', body: shared });
        invalidateCachePrefix('/api/invoices');
        invalidateCachePrefix(`/api/invoices/${invoice.id}`);
        toast('Facture mise à jour.', 'success');
      } else {
        await api('/api/invoices', {
          method: 'POST',
          body: { ...shared, docType: 'INVOICE' },
        });
        invalidateCachePrefix('/api/invoices');
        invalidateCachePrefix('/api/dashboard/stats');
        toast('Facture créée.', 'success');
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

  if (!clientsLoading && clients.length === 0) {
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
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Client *
          <select
            required
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setProjectId('');
            }}
            className={inputClass}
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
        </label>
        {clientId && projects.length > 0 && (
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

        <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Prestations *
          <div className="flex flex-col gap-2">
            {lineItems.map((item, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center"
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
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className={inputClass}
          />
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
          Échéance
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </label>
        {planLimitMessage && <PlanLimitPrompt message={planLimitMessage} />}
        {error && (
          <p role="alert" className="font-body text-sm text-tag-red-fg">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting
            ? 'Enregistrement…'
            : invoice
              ? 'Enregistrer les modifications'
              : 'Créer la facture'}
        </button>
      </form>

      <div className="lg:w-64 lg:flex-shrink-0">
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
              {selectedClient
                ? `${selectedClient.code} — ${selectedClient.name}`
                : 'Sélectionnez un client'}
            </p>
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
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">Acompte</p>
                <p className="flex-shrink-0 text-[11px] text-muted-foreground">
                  {formatPrice(depositValue, currency)}
                </p>
              </div>
            )}
          </div>
          {dueDate && (
            <p className="text-[11px] text-muted-foreground">Échéance {formatDate(dueDate)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
