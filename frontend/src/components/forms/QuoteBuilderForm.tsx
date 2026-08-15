'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { useToast } from '@/contexts/ToastContext';
import { formatPrice } from '@/lib/utils';
import { computeItemsTotal, computeQuoteTotal } from '@/lib/invoiceTotals';
import { PlanLimitPrompt, isPlanLimitCode } from '@/components/ui/PlanLimitPrompt';
import { Icon } from '@/components/ui/Icon';
import { CURRENCIES } from '@/lib/constants';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

const MAX_PACKS = 20;
const MAX_ITEMS_PER_PACK = 50;

interface ClientOption {
  id: string;
  code: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
}

interface ItemDraft {
  designation: string;
  quantity: string;
  unitPrice: string;
}
interface PackDraft {
  title: string;
  description: string;
  items: ItemDraft[];
}

export interface QuoteBuilderExisting {
  id: string;
  clientId: string;
  projectId: string | null;
  description: string | null;
  currency: string;
  dueDate: string | null;
  packs: {
    title: string;
    description: string | null;
    items: { designation: string; quantity: number; unitPrice: number }[];
  }[];
}

function emptyItem(): ItemDraft {
  return { designation: '', quantity: '1', unitPrice: '' };
}
function emptyPack(): PackDraft {
  return { title: '', description: '', items: [emptyItem()] };
}

function initialPacks(existing?: QuoteBuilderExisting): PackDraft[] {
  if (existing && existing.packs.length > 0) {
    return existing.packs.map((pack) => ({
      title: pack.title,
      description: pack.description ?? '',
      items: pack.items.map((item) => ({
        designation: item.designation,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
      })),
    }));
  }
  return [emptyPack()];
}

export function QuoteBuilderForm({ quote }: { quote?: QuoteBuilderExisting }) {
  const router = useRouter();
  const { toast } = useToast();
  const { openCreate } = useCreateMenu();
  const { data: clientsData, loading: clientsLoading } = useApi<{ items: ClientOption[] }>(
    '/api/clients?limit=50',
  );
  const clients = clientsData?.items ?? [];

  const [clientId, setClientId] = useState(quote?.clientId ?? '');
  const { data: projectsData } = useApi<{ items: ProjectOption[] }>(
    `/api/projects?clientId=${clientId}&limit=50`,
    { skip: !clientId },
  );
  const projects = projectsData?.items ?? [];

  const [projectId, setProjectId] = useState(quote?.projectId ?? '');
  const [description, setDescription] = useState(quote?.description ?? '');
  const [currency, setCurrency] = useState(quote?.currency ?? 'XOF');
  const [dueDate, setDueDate] = useState(quote?.dueDate ? quote.dueDate.slice(0, 10) : '');
  const [packs, setPacks] = useState<PackDraft[]>(() => initialPacks(quote));

  const [error, setError] = useState<string | null>(null);
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updatePackField(packIndex: number, field: 'title' | 'description', value: string) {
    setPacks((prev) => prev.map((p, i) => (i === packIndex ? { ...p, [field]: value } : p)));
  }
  function addPack() {
    setPacks((prev) => (prev.length >= MAX_PACKS ? prev : [...prev, emptyPack()]));
  }
  function removePack(packIndex: number) {
    setPacks((prev) => prev.filter((_, i) => i !== packIndex));
  }
  function updateItem(packIndex: number, itemIndex: number, field: keyof ItemDraft, value: string) {
    setPacks((prev) =>
      prev.map((p, i) =>
        i === packIndex
          ? {
              ...p,
              items: p.items.map((it, j) => (j === itemIndex ? { ...it, [field]: value } : it)),
            }
          : p,
      ),
    );
  }
  function addItem(packIndex: number) {
    setPacks((prev) =>
      prev.map((p, i) =>
        i === packIndex && p.items.length < MAX_ITEMS_PER_PACK
          ? { ...p, items: [...p.items, emptyItem()] }
          : p,
      ),
    );
  }
  function removeItem(packIndex: number, itemIndex: number) {
    setPacks((prev) =>
      prev.map((p, i) =>
        i === packIndex ? { ...p, items: p.items.filter((_, j) => j !== itemIndex) } : p,
      ),
    );
  }

  const numericPacks = packs.map((p) => ({
    items: p.items.map((it) => ({
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
    })),
  }));
  const grandTotal = computeQuoteTotal(numericPacks);

  function buildPacksPayload():
    | {
        title: string;
        description?: string;
        items: { designation: string; quantity: number; unitPrice: number }[];
      }[]
    | null {
    const built: {
      title: string;
      description?: string;
      items: { designation: string; quantity: number; unitPrice: number }[];
    }[] = [];
    for (const pack of packs) {
      const title = pack.title.trim();
      const items = pack.items
        .map((it) => ({
          designation: it.designation.trim(),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        }))
        .filter((it) => it.designation && it.quantity > 0 && it.unitPrice > 0);
      if (!title || items.length === 0) {
        setError(
          'Chaque offre doit avoir un titre et au moins une ligne valide (désignation, quantité, prix).',
        );
        return null;
      }
      built.push({
        title,
        ...(pack.description.trim() ? { description: pack.description.trim() } : {}),
        items,
      });
    }
    return built;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setPlanLimitMessage(null);
    const packsPayload = buildPacksPayload();
    if (!packsPayload) {
      setSubmitting(false);
      return;
    }
    const shared = {
      clientId,
      projectId: projectId || null,
      description: description || null,
      packs: packsPayload,
      currency,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };
    try {
      if (quote) {
        await api(`/api/invoices/${quote.id}`, { method: 'PATCH', body: shared });
        invalidateCachePrefix('/api/invoices');
        invalidateCachePrefix(`/api/invoices/${quote.id}`);
        toast('Devis mis à jour.', 'success');
        router.push(`/invoices/${quote.id}`);
      } else {
        const created = await api<{ id: string }>('/api/invoices', {
          method: 'POST',
          body: { ...shared, docType: 'QUOTE' },
        });
        invalidateCachePrefix('/api/invoices');
        invalidateCachePrefix('/api/dashboard/stats');
        toast('Devis créé.', 'success');
        router.push(`/invoices/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && isPlanLimitCode(err.code)) {
        const detail = err.body.message;
        setPlanLimitMessage(typeof detail === 'string' ? detail : err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
      setSubmitting(false);
    }
  }

  function cancel() {
    router.push(quote ? `/invoices/${quote.id}` : '/invoices');
  }

  if (!clientsLoading && clients.length === 0) {
    return (
      <div className="flex flex-col gap-4 px-4 py-10 sm:px-6 lg:px-8">
        <p className="font-body text-sm text-muted-foreground">
          Vous devez d&apos;abord ajouter un client avant de créer un devis.
        </p>
        <button
          type="button"
          onClick={() => openCreate('client')}
          className="w-fit rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground"
        >
          Ajouter un client
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 px-4 pb-28 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-headings text-xl font-bold text-foreground">
          {quote ? 'Modifier le devis' : 'Nouveau devis'}
        </h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Composez une ou plusieurs offres, chacune avec ses propres lignes de prestation.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-canvas p-5 shadow-card">
        <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Destinataire
        </p>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Échéance
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Offres à passer
          </p>
          <button
            type="button"
            onClick={addPack}
            disabled={packs.length >= MAX_PACKS}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-40"
          >
            <Icon i="plus" size={13} />
            Ajouter une offre
          </button>
        </div>

        {packs.map((pack, packIndex) => {
          const packTotal = computeItemsTotal(
            pack.items.map((it) => ({
              quantity: Number(it.quantity) || 0,
              unitPrice: Number(it.unitPrice) || 0,
            })),
          );
          return (
            <div
              key={packIndex}
              className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 shadow-card"
            >
              <div className="flex items-start gap-2">
                <Icon
                  i="package"
                  size={16}
                  className="mt-2.5 flex-shrink-0 text-muted-foreground"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    required
                    placeholder="Titre de l'offre (ex : Essentiel, Premium…)"
                    value={pack.title}
                    onChange={(e) => updatePackField(packIndex, 'title', e.target.value)}
                    maxLength={200}
                    className={`${inputClass} min-w-0 flex-1 font-medium`}
                  />
                  <input
                    type="text"
                    placeholder="Description (optionnel)"
                    value={pack.description}
                    onChange={(e) => updatePackField(packIndex, 'description', e.target.value)}
                    maxLength={1000}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePack(packIndex)}
                  disabled={packs.length <= 1}
                  aria-label="Retirer cette offre"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30"
                >
                  <Icon i="trash" size={14} />
                </button>
              </div>

              <div className="flex flex-col gap-2 pl-6">
                {pack.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
                    className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center"
                  >
                    <input
                      type="text"
                      placeholder="Désignation"
                      value={item.designation}
                      onChange={(e) =>
                        updateItem(packIndex, itemIndex, 'designation', e.target.value)
                      }
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
                        onChange={(e) =>
                          updateItem(packIndex, itemIndex, 'quantity', e.target.value)
                        }
                        className={`${inputClass} w-16 flex-shrink-0`}
                      />
                      <input
                        type="number"
                        min={1}
                        step={1}
                        placeholder={`Prix (${currency})`}
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItem(packIndex, itemIndex, 'unitPrice', e.target.value)
                        }
                        className={`${inputClass} w-28 flex-shrink-0`}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(packIndex, itemIndex)}
                        disabled={pack.items.length <= 1}
                        aria-label="Retirer cette ligne"
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30"
                      >
                        <Icon i="trash" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addItem(packIndex)}
                  disabled={pack.items.length >= MAX_ITEMS_PER_PACK}
                  className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-40"
                >
                  <Icon i="plus" size={13} />
                  Ajouter une ligne
                </button>
                <p className="flex items-center justify-between font-body text-sm font-semibold text-foreground">
                  Sous-total de l&apos;offre
                  <span>{formatPrice(packTotal, currency)}</span>
                </p>
              </div>
            </div>
          );
        })}
      </section>

      {planLimitMessage && <PlanLimitPrompt message={planLimitMessage} />}
      {error && (
        <p role="alert" className="font-body text-sm text-tag-red-fg">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-canvas/95 px-4 py-3 shadow-xl backdrop-blur sm:-mx-6 lg:-mx-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-body text-[11px] text-muted-foreground uppercase">Total général</p>
            <p className="font-headings text-lg font-bold text-foreground">
              {formatPrice(grandTotal, currency)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={submitting}
              className="rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting
                ? 'Enregistrement…'
                : quote
                  ? 'Enregistrer les modifications'
                  : 'Créer le devis'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
