'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { formatPrice } from '@/lib/utils';
import { computeItemsTotal } from '@/lib/invoiceTotals';
import { PlanLimitPrompt, isPlanLimitCode } from '@/components/ui/PlanLimitPrompt';
import { Icon } from '@/components/ui/Icon';
import { DatePicker } from '@/components/ui/DatePicker';
import { ContentBlockList, type ContentBlockDraft } from '@/components/forms/ContentBlockList';
import {
  CURRENCIES,
  FREELANCE_SECTOR_LABELS,
  FREELANCE_SECTOR_ICONS,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_ICONS,
  SECTOR_PROJECT_TYPES,
  resolveFreelanceSector,
  type FreelanceSector,
  type ProjectType,
} from '@/lib/constants';
import { PROJECT_TYPE_DEFAULT_STEPS, PROJECT_TYPE_DEFAULT_CONDITIONS } from '@/lib/projectDefaults';

const FREELANCE_SECTORS = Object.keys(FREELANCE_SECTOR_LABELS) as FreelanceSector[];

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
type DepositTypeDraft = 'FIXED' | 'PERCENT' | '';
interface PackDraft {
  title: string;
  description: string;
  turnaroundTime: string;
  items: ItemDraft[];
  depositType: DepositTypeDraft;
  depositValue: string;
}

// ContentBlockDraft/ContentBlockList live in @/components/forms/ContentBlockList
// (shared with the freelancer's default-payment-methods editor in
// Paramètres → Facturation). Only the kind enum stays local to this form.
type ContentBlockKind = 'PROCESS' | 'CONDITIONS' | 'PAYMENT_METHOD' | 'FAQ';

export interface QuoteBuilderExisting {
  id: string;
  clientId: string;
  projectId: string | null;
  description: string | null;
  sector: string | null;
  type: string | null;
  currency: string;
  dueDate: string | null;
  paymentTermsNote: string | null;
  footerNote: string | null;
  packs: {
    title: string;
    description: string | null;
    turnaroundTime: string | null;
    items: { designation: string; quantity: number; unitPrice: number }[];
    depositType: string | null;
    depositValue: number | null;
  }[];
  contentBlocks: { kind: string; primaryText: string; secondaryText: string | null }[];
}

function emptyItem(): ItemDraft {
  return { designation: '', quantity: '1', unitPrice: '' };
}
function emptyPack(): PackDraft {
  return {
    title: '',
    description: '',
    turnaroundTime: '',
    items: [emptyItem()],
    depositType: '',
    depositValue: '',
  };
}

function initialPacks(existing?: QuoteBuilderExisting): PackDraft[] {
  if (existing && existing.packs.length > 0) {
    return existing.packs.map((pack) => ({
      title: pack.title,
      description: pack.description ?? '',
      turnaroundTime: pack.turnaroundTime ?? '',
      items: pack.items.map((item) => ({
        designation: item.designation,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
      })),
      depositType:
        pack.depositType === 'FIXED' || pack.depositType === 'PERCENT' ? pack.depositType : '',
      depositValue: pack.depositValue != null ? String(pack.depositValue) : '',
    }));
  }
  return [emptyPack()];
}

/** Preview-only estimate for the deposit config draft, shown inline as the user types. */
function previewPackDeposit(pack: PackDraft, packTotal: number): number | null {
  if (!pack.depositType || !pack.depositValue.trim()) return null;
  const raw = Number(pack.depositValue);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  if (pack.depositType === 'PERCENT') return Math.round((packTotal * Math.min(raw, 100)) / 100);
  return raw;
}

// Fallback FAQ shown on a brand-new devis when there's no prior quote to
// template from — professional, generic, never overwrites a freelance's own
// content once they've written any FAQ block themselves.
const DEFAULT_QUOTE_FAQ: ContentBlockDraft[] = [
  {
    primaryText: 'Que se passe-t-il si des modifications sont demandées après validation ?',
    secondaryText:
      "Les retouches mineures liées au périmètre initial sont incluses. Toute demande allant au-delà fait l'objet d'un avenant ou d'un devis complémentaire.",
  },
  {
    primaryText: 'Comment démarre le projet une fois le devis accepté ?',
    secondaryText:
      "Dès réception de l'acompte (si prévu), un lien de suivi personnalisé est transmis pour suivre l'avancement en temps réel.",
  },
];

function blocksOfKind(
  contentBlocks: { kind: string; primaryText: string; secondaryText: string | null }[],
  kind: ContentBlockKind,
): ContentBlockDraft[] {
  return contentBlocks
    .filter((b) => b.kind === kind)
    .map((b) => ({ primaryText: b.primaryText, secondaryText: b.secondaryText ?? '' }));
}

function stepsTemplateFor(type: ProjectType): ContentBlockDraft[] {
  return (PROJECT_TYPE_DEFAULT_STEPS[type] ?? PROJECT_TYPE_DEFAULT_STEPS.OTHER).map((s) => ({
    primaryText: s.title,
    secondaryText: s.description,
  }));
}

function conditionsTemplateFor(type: ProjectType): ContentBlockDraft[] {
  return (PROJECT_TYPE_DEFAULT_CONDITIONS[type] ?? PROJECT_TYPE_DEFAULT_CONDITIONS.OTHER).map(
    (c) => ({
      primaryText: c.primaryText,
      secondaryText: c.secondaryText,
    }),
  );
}

export function QuoteBuilderForm({
  quote,
  lockedClient,
}: {
  quote?: QuoteBuilderExisting;
  /** When set (e.g. "Nouveau devis" from a client's own page), the client
   *  picker is replaced by a read-only label — same pattern as ProjectForm/
   *  InvoiceForm's `lockedClient`. */
  lockedClient?: { id: string; label: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { openCreate } = useCreateMenu();
  const { user } = useAuth();
  const { data: clientsData, loading: clientsLoading } = useApi<{ items: ClientOption[] }>(
    '/api/clients?limit=50',
  );
  const clients = clientsData?.items ?? [];

  const [clientId, setClientId] = useState(lockedClient?.id ?? quote?.clientId ?? '');
  const { data: projectsData } = useApi<{ items: ProjectOption[] }>(
    `/api/projects?clientId=${clientId}&limit=50`,
    { skip: !clientId },
  );
  const projects = projectsData?.items ?? [];

  const [projectId, setProjectId] = useState(quote?.projectId ?? '');
  const [description, setDescription] = useState(quote?.description ?? '');
  const resolvedSector = resolveFreelanceSector(
    quote?.sector,
    (quote?.type as ProjectType | null) ?? undefined,
  );
  const [sector, setSector] = useState<FreelanceSector>(resolvedSector.code);
  const [sectorOther, setSectorOther] = useState(resolvedSector.other);
  const [projectType, setProjectType] = useState<ProjectType>(
    (quote?.type as ProjectType | null) ?? 'OTHER',
  );
  const [currency, setCurrency] = useState(quote?.currency ?? 'XOF');
  const [dueDate, setDueDate] = useState(quote?.dueDate ? quote.dueDate.slice(0, 10) : '');
  const [packs, setPacks] = useState<PackDraft[]>(() => initialPacks(quote));

  const [paymentTermsNote, setPaymentTermsNote] = useState(quote?.paymentTermsNote ?? '');
  // A new devis pre-fills footerNote from the freelance's default legal
  // mention (same pattern as InvoiceForm.tsx) — an existing quote's own
  // saved footerNote always wins.
  const [footerNote, setFooterNote] = useState(
    quote?.footerNote ?? user?.defaultLegalMention ?? '',
  );
  const [processBlocks, setProcessBlocks] = useState<ContentBlockDraft[]>(() =>
    blocksOfKind(quote?.contentBlocks ?? [], 'PROCESS'),
  );
  const [conditionBlocks, setConditionBlocks] = useState<ContentBlockDraft[]>(() =>
    blocksOfKind(quote?.contentBlocks ?? [], 'CONDITIONS'),
  );
  // Guards the secteur/type-driven auto-fill below from ever overwriting
  // real content: true from the start when editing a quote that already has
  // that section filled in, and flipped true the moment the user actually
  // types into either section via ContentBlockList's onChange. Sector/type
  // auto-fill itself never sets these, so switching secteur/type keeps
  // refreshing the template right up until the user edits something.
  const [processTouched, setProcessTouched] = useState(
    () => !!quote && blocksOfKind(quote.contentBlocks, 'PROCESS').length > 0,
  );
  const [conditionTouched, setConditionTouched] = useState(
    () => !!quote && blocksOfKind(quote.contentBlocks, 'CONDITIONS').length > 0,
  );
  function onProcessBlocksChange(blocks: ContentBlockDraft[]) {
    setProcessTouched(true);
    setProcessBlocks(blocks);
  }
  function onConditionBlocksChange(blocks: ContentBlockDraft[]) {
    setConditionTouched(true);
    setConditionBlocks(blocks);
  }
  const [paymentBlocks, setPaymentBlocks] = useState<ContentBlockDraft[]>(() =>
    blocksOfKind(quote?.contentBlocks ?? [], 'PAYMENT_METHOD'),
  );
  const [faqBlocks, setFaqBlocks] = useState<ContentBlockDraft[]>(() =>
    blocksOfKind(quote?.contentBlocks ?? [], 'FAQ'),
  );

  // "Last quote as template" — pre-fill the additional content sections from
  // the user's most recently created devis (new quotes only, and only if the
  // user hasn't already started filling these sections in themselves).
  const { data: lastQuotesData } = useApi<{ items: { id: string }[] }>(
    '/api/invoices?docType=QUOTE&limit=1',
    { skip: !!quote },
  );
  const lastQuoteId = lastQuotesData?.items?.[0]?.id;
  const { data: lastQuoteDetail, error: lastQuoteDetailError } = useApi<{
    paymentTermsNote: string | null;
    contentBlocks: { kind: string; primaryText: string; secondaryText: string | null }[];
  }>(`/api/invoices/${lastQuoteId}`, { skip: !lastQuoteId || !!quote });
  // The freelancer's own default payment methods (Paramètres → Facturation)
  // take priority over the "last quote as template" mechanism for the
  // PAYMENT_METHOD section specifically — a durable, intentional source
  // instead of whatever happened to be typed on whichever devis came before.
  const { data: defaultPaymentMethodsData, error: defaultPaymentMethodsError } = useApi<{
    methods: { primaryText: string; secondaryText: string | null }[];
  }>('/api/settings/payment-methods', { skip: !!quote });
  const templateAppliedRef = useRef(false);
  useEffect(() => {
    if (quote || templateAppliedRef.current) return;
    // "Settled" = either the data arrived, the fetch errored (don't block
    // forever on a flaky network), or (last-quote only) we've confirmed
    // there simply is no prior devis to template from.
    const lastQuoteSettled =
      !!lastQuoteDetail || !!lastQuoteDetailError || (!!lastQuotesData && !lastQuoteId);
    const defaultsSettled = !!defaultPaymentMethodsData || !!defaultPaymentMethodsError;
    if (!lastQuoteSettled || !defaultsSettled) return;

    const untouched =
      processBlocks.length === 0 &&
      conditionBlocks.length === 0 &&
      paymentBlocks.length === 0 &&
      faqBlocks.length === 0 &&
      paymentTermsNote === '';
    templateAppliedRef.current = true;
    if (!untouched) return; // user already started typing, don't clobber their edits

    if (lastQuoteDetail) {
      setProcessBlocks(blocksOfKind(lastQuoteDetail.contentBlocks, 'PROCESS'));
      setConditionBlocks(blocksOfKind(lastQuoteDetail.contentBlocks, 'CONDITIONS'));
      const lastFaq = blocksOfKind(lastQuoteDetail.contentBlocks, 'FAQ');
      setFaqBlocks(lastFaq.length > 0 ? lastFaq : DEFAULT_QUOTE_FAQ);
      if (lastQuoteDetail.paymentTermsNote) setPaymentTermsNote(lastQuoteDetail.paymentTermsNote);
    } else {
      // First devis ever — no prior quote to inherit a FAQ from.
      setFaqBlocks(DEFAULT_QUOTE_FAQ);
    }

    const defaultMethods = defaultPaymentMethodsData?.methods ?? [];
    if (defaultMethods.length > 0) {
      setPaymentBlocks(
        defaultMethods.map((m) => ({
          primaryText: m.primaryText,
          secondaryText: m.secondaryText ?? '',
        })),
      );
    } else {
      const lastPayment = lastQuoteDetail
        ? blocksOfKind(lastQuoteDetail.contentBlocks, 'PAYMENT_METHOD')
        : [];
      // Never leave the section at zero rows — an empty one is ready to
      // fill in rather than requiring a click on "+ Ajouter" first.
      setPaymentBlocks(
        lastPayment.length > 0 ? lastPayment : [{ primaryText: '', secondaryText: '' }],
      );
    }
    // Only re-run when the template/default data itself arrives —
    // deliberately not depending on the draft state above, which would
    // re-trigger on every keystroke since this effect also writes to it.
  }, [
    lastQuoteDetail,
    lastQuoteDetailError,
    lastQuotesData,
    lastQuoteId,
    defaultPaymentMethodsData,
    defaultPaymentMethodsError,
  ]);

  const [error, setError] = useState<string | null>(null);
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [invalidPackIndexes, setInvalidPackIndexes] = useState<Set<number>>(new Set());
  const clientRef = useRef<HTMLSelectElement>(null);
  const packsRef = useRef<HTMLDivElement>(null);

  function clearPacksError() {
    if (packsError) setPacksError(null);
    if (invalidPackIndexes.size > 0) setInvalidPackIndexes(new Set());
  }

  function updatePackField(
    packIndex: number,
    field: 'title' | 'description' | 'turnaroundTime',
    value: string,
  ) {
    setPacks((prev) => prev.map((p, i) => (i === packIndex ? { ...p, [field]: value } : p)));
    clearPacksError();
  }
  function setPackDepositType(packIndex: number, depositType: DepositTypeDraft) {
    setPacks((prev) => prev.map((p, i) => (i === packIndex ? { ...p, depositType } : p)));
    clearPacksError();
  }
  function setPackDepositValue(packIndex: number, depositValue: string) {
    setPacks((prev) => prev.map((p, i) => (i === packIndex ? { ...p, depositValue } : p)));
    clearPacksError();
  }
  function addPack() {
    setPacks((prev) => (prev.length >= MAX_PACKS ? prev : [...prev, emptyPack()]));
    clearPacksError();
  }
  function removePack(packIndex: number) {
    setPacks((prev) => prev.filter((_, i) => i !== packIndex));
    clearPacksError();
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
    clearPacksError();
  }
  function addItem(packIndex: number) {
    setPacks((prev) =>
      prev.map((p, i) =>
        i === packIndex && p.items.length < MAX_ITEMS_PER_PACK
          ? { ...p, items: [...p.items, emptyItem()] }
          : p,
      ),
    );
    clearPacksError();
  }
  function removeItem(packIndex: number, itemIndex: number) {
    setPacks((prev) =>
      prev.map((p, i) =>
        i === packIndex ? { ...p, items: p.items.filter((_, j) => j !== itemIndex) } : p,
      ),
    );
    clearPacksError();
  }

  // Each offer stands alone — the client picks ONE, so there is no grand
  // total to compute here. packTotals feeds the sticky bar's per-offer
  // price list (see the "les offres au choix" render below).
  const packTotals = packs.map((p) =>
    computeItemsTotal(
      p.items.map((it) => ({
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.unitPrice) || 0,
      })),
    ),
  );

  function buildPacksPayload():
    | {
        title: string;
        description?: string;
        turnaroundTime?: string;
        items: { designation: string; quantity: number; unitPrice: number }[];
        depositType?: 'FIXED' | 'PERCENT';
        depositValue?: number;
      }[]
    | null {
    const built: {
      title: string;
      description?: string;
      turnaroundTime?: string;
      items: { designation: string; quantity: number; unitPrice: number }[];
      depositType?: 'FIXED' | 'PERCENT';
      depositValue?: number;
    }[] = [];
    const invalid = new Set<number>();
    packs.forEach((pack, i) => {
      const title = pack.title.trim();
      const items = pack.items
        .map((it) => ({
          designation: it.designation.trim(),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        }))
        .filter((it) => it.designation && it.quantity > 0 && it.unitPrice > 0);
      if (!title || items.length === 0) {
        invalid.add(i);
        return;
      }
      let deposit: { depositType: 'FIXED' | 'PERCENT'; depositValue: number } | null = null;
      if (pack.depositType) {
        const rawValue = Number(pack.depositValue);
        if (!pack.depositValue.trim() || !Number.isFinite(rawValue) || rawValue <= 0) {
          invalid.add(i);
          return;
        }
        if (pack.depositType === 'PERCENT' && rawValue > 100) {
          invalid.add(i);
          return;
        }
        if (pack.depositType === 'FIXED' && rawValue > computeItemsTotal(items)) {
          invalid.add(i);
          return;
        }
        deposit = { depositType: pack.depositType, depositValue: rawValue };
      }
      built.push({
        title,
        ...(pack.description.trim() ? { description: pack.description.trim() } : {}),
        ...(pack.turnaroundTime.trim() ? { turnaroundTime: pack.turnaroundTime.trim() } : {}),
        items,
        ...(deposit ? deposit : {}),
      });
    });
    if (invalid.size > 0) {
      setInvalidPackIndexes(invalid);
      setPacksError(
        "Chaque offre doit avoir un titre, au moins une ligne valide (désignation, quantité, prix), et — si un acompte est défini — une valeur positive cohérente (≤ 100% ou ≤ sous-total de l'offre).",
      );
      return null;
    }
    return built;
  }

  // Additional content sections are optional value-adds, not required
  // fields like pack items — blank rows are silently dropped rather than
  // blocking submission.
  function buildContentBlocksPayload(): {
    kind: ContentBlockKind;
    primaryText: string;
    secondaryText?: string;
  }[] {
    const groups: [ContentBlockKind, ContentBlockDraft[]][] = [
      ['PROCESS', processBlocks],
      ['CONDITIONS', conditionBlocks],
      ['PAYMENT_METHOD', paymentBlocks],
      ['FAQ', faqBlocks],
    ];
    const built: { kind: ContentBlockKind; primaryText: string; secondaryText?: string }[] = [];
    for (const [kind, blocks] of groups) {
      for (const block of blocks) {
        const primaryText = block.primaryText.trim();
        if (!primaryText) continue;
        const secondaryText = block.secondaryText.trim();
        built.push({ kind, primaryText, ...(secondaryText ? { secondaryText } : {}) });
      }
    }
    return built;
  }

  async function saveQuote(targetStatus: 'DRAFT' | 'SENT') {
    setClientError(null);
    setPacksError(null);
    setInvalidPackIndexes(new Set());
    if (!clientId) {
      setClientError('Sélectionnez un client.');
      clientRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      clientRef.current?.focus();
      return;
    }
    const packsPayload = buildPacksPayload();
    if (!packsPayload) {
      packsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    setError(null);
    setPlanLimitMessage(null);
    const shared = {
      clientId,
      projectId: projectId || null,
      description: description || null,
      sector: sector === 'OTHER' ? sectorOther.trim() || 'OTHER' : sector,
      type: projectType,
      packs: packsPayload,
      contentBlocks: buildContentBlocksPayload(),
      paymentTermsNote: paymentTermsNote.trim() || null,
      footerNote: footerNote.trim() || null,
      currency,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      status: targetStatus,
    };
    try {
      if (quote) {
        await api(`/api/invoices/${quote.id}`, { method: 'PATCH', body: shared });
        invalidateCachePrefix('/api/invoices');
        invalidateCachePrefix(`/api/invoices/${quote.id}`);
        toast(
          targetStatus === 'SENT' ? 'Devis prêt à envoyer.' : 'Brouillon enregistré.',
          'success',
        );
        router.push(`/invoices/${quote.id}`);
      } else {
        const created = await api<{ id: string }>('/api/invoices', {
          method: 'POST',
          body: { ...shared, docType: 'QUOTE' },
        });
        invalidateCachePrefix('/api/invoices');
        invalidateCachePrefix('/api/dashboard/stats');
        toast(
          targetStatus === 'SENT' ? 'Devis prêt à envoyer.' : 'Brouillon enregistré.',
          'success',
        );
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

  // Enter-key fallback inside a text input still triggers a native form
  // submit — treat that as "save draft", the least destructive outcome,
  // since it wasn't an explicit click on either named action button below.
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void saveQuote('DRAFT');
  }

  // router.back() when real history exists — router.push() here would stack
  // a *second* /invoices/[id] entry on top of the /edit-quote one instead of
  // returning to it, so the page's own "Retour" button (which does use
  // router.back(), see BackButton.tsx) would then land back on /edit-quote
  // instead of wherever the freelance actually came from.
  function cancel() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(quote ? `/invoices/${quote.id}` : '/invoices');
    }
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
          Secteur freelance
          <div className="flex flex-wrap gap-2">
            {FREELANCE_SECTORS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSector(value);
                  const newType =
                    value === 'OTHER' ? 'OTHER' : (SECTOR_PROJECT_TYPES[value][0] ?? 'OTHER');
                  setProjectType(newType);
                  if (!processTouched) setProcessBlocks(stepsTemplateFor(newType));
                  if (!conditionTouched) setConditionBlocks(conditionsTemplateFor(newType));
                }}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  sector === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-canvas text-foreground'
                }`}
              >
                <Icon i={FREELANCE_SECTOR_ICONS[value]} size={13} />
                {FREELANCE_SECTOR_LABELS[value]}
              </button>
            ))}
          </div>
          {sector === 'OTHER' && (
            <input
              type="text"
              value={sectorOther}
              onChange={(e) => setSectorOther(e.target.value)}
              placeholder="Précisez votre secteur…"
              maxLength={100}
              className={`${inputClass} mt-1`}
            />
          )}
        </div>
        {sector !== 'OTHER' && (
          <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Type de projet
            <div className="flex flex-wrap gap-2">
              {SECTOR_PROJECT_TYPES[sector].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setProjectType(value);
                    if (!processTouched) setProcessBlocks(stepsTemplateFor(value));
                    if (!conditionTouched) setConditionBlocks(conditionsTemplateFor(value));
                  }}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    projectType === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-canvas text-foreground'
                  }`}
                >
                  <Icon i={PROJECT_TYPE_ICONS[value]} size={13} />
                  {PROJECT_TYPE_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
        )}
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
            Échéance{' '}
            <span className="font-normal text-muted-foreground">
              (date d&apos;expiration du devis)
            </span>
            <DatePicker value={dueDate} onChange={setDueDate} />
          </label>
        </div>
      </section>

      <section ref={packsRef} className="flex flex-col gap-4">
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
        <p className="-mt-2 font-body text-xs text-muted-foreground">
          Le client choisira une seule de ces offres — chacune a son propre total, ce n&apos;est pas
          une somme.
        </p>
        {packsError && (
          <p role="alert" className="font-body text-sm text-tag-red-fg">
            {packsError}
          </p>
        )}

        {packs.map((pack, packIndex) => {
          const packTotal = packTotals[packIndex] ?? 0;
          const packInvalid = invalidPackIndexes.has(packIndex);
          return (
            <div
              key={packIndex}
              className={`flex flex-col gap-3 rounded-lg border p-5 shadow-card ${
                packInvalid ? 'border-tag-red-fg' : 'border-border'
              }`}
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

              <div className="pl-6">
                <input
                  type="text"
                  placeholder="Délai de réalisation (ex : 2 semaines)"
                  value={pack.turnaroundTime}
                  onChange={(e) => updatePackField(packIndex, 'turnaroundTime', e.target.value)}
                  maxLength={200}
                  className={`${inputClass} w-full`}
                />
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

                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <p className="font-body text-xs font-medium text-foreground">
                    Acompte pour cette offre (optionnel)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPackDepositType(packIndex, '')}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        pack.depositType === ''
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-canvas text-foreground'
                      }`}
                    >
                      Aucun
                    </button>
                    <button
                      type="button"
                      onClick={() => setPackDepositType(packIndex, 'FIXED')}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        pack.depositType === 'FIXED'
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-canvas text-foreground'
                      }`}
                    >
                      Montant fixe
                    </button>
                    <button
                      type="button"
                      onClick={() => setPackDepositType(packIndex, 'PERCENT')}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        pack.depositType === 'PERCENT'
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-canvas text-foreground'
                      }`}
                    >
                      Taux (%)
                    </button>
                    {pack.depositType && (
                      <input
                        type="number"
                        min={1}
                        max={pack.depositType === 'PERCENT' ? 100 : undefined}
                        step={1}
                        placeholder={pack.depositType === 'PERCENT' ? '%' : `Montant (${currency})`}
                        value={pack.depositValue}
                        onChange={(e) => setPackDepositValue(packIndex, e.target.value)}
                        className={`${inputClass} w-28 flex-shrink-0`}
                      />
                    )}
                  </div>
                  {(() => {
                    const preview = previewPackDeposit(pack, packTotal);
                    return preview != null ? (
                      <p className="font-body text-xs text-muted-foreground">
                        Acompte estimé : {formatPrice(preview, currency)}
                      </p>
                    ) : null;
                  })()}
                </div>

                <p className="flex items-center justify-between font-body text-sm font-semibold text-foreground">
                  Sous-total de l&apos;offre
                  <span>{formatPrice(packTotal, currency)}</span>
                </p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-4">
        <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Contenu additionnel
        </p>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Icon i="user" size={16} className="text-muted-foreground" />
            <p className="font-body text-sm font-semibold text-foreground">Votre présentation</p>
          </div>
          {user?.bio ? (
            <p className="font-body text-sm whitespace-pre-wrap text-foreground">{user.bio}</p>
          ) : (
            <p className="font-body text-sm text-muted-foreground">
              Aucune bio renseignée —{' '}
              <a href="/settings?tab=compte" className="text-primary hover:underline">
                remplis le champ Bio dans Paramètres → Compte
              </a>{' '}
              pour qu&apos;elle apparaisse sur tes devis.
            </p>
          )}
        </div>

        <ContentBlockList
          title="Étapes du projet"
          icon="list"
          primaryPlaceholder="Titre de l'étape (ex : Brief & découverte)"
          secondaryPlaceholder="Description (optionnel)"
          addLabel="Ajouter une étape"
          blocks={processBlocks}
          onChange={onProcessBlocksChange}
        />

        <ContentBlockList
          title="Conditions"
          icon="shield"
          primaryPlaceholder="Titre de la condition (ex : Délai de validation)"
          secondaryPlaceholder="Détail (optionnel)"
          addLabel="Ajouter une condition"
          blocks={conditionBlocks}
          onChange={onConditionBlocksChange}
        />

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Icon i="credit-card" size={16} className="text-muted-foreground" />
            <p className="font-body text-sm font-semibold text-foreground">Modalités de paiement</p>
          </div>
          <textarea
            placeholder="Ex : Un acompte de 50% est demandé avant le démarrage, le solde à la livraison."
            value={paymentTermsNote}
            onChange={(e) => setPaymentTermsNote(e.target.value)}
            maxLength={2000}
            rows={2}
            className={`${inputClass} resize-none`}
          />
          {paymentBlocks.length > 0 && (
            <div className="flex flex-col gap-2">
              {paymentBlocks.map((block, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center"
                >
                  <input
                    type="text"
                    placeholder="Moyen de paiement (ex : Wave, Orange Money, Virement)"
                    value={block.primaryText}
                    onChange={(e) =>
                      setPaymentBlocks((prev) =>
                        prev.map((b, i) =>
                          i === index ? { ...b, primaryText: e.target.value } : b,
                        ),
                      )
                    }
                    maxLength={500}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <input
                    type="text"
                    placeholder="Numéro / IBAN"
                    value={block.secondaryText}
                    onChange={(e) =>
                      setPaymentBlocks((prev) =>
                        prev.map((b, i) =>
                          i === index ? { ...b, secondaryText: e.target.value } : b,
                        ),
                      )
                    }
                    maxLength={2000}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => setPaymentBlocks((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Retirer"
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
                  >
                    <Icon i="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              setPaymentBlocks((prev) => [...prev, { primaryText: '', secondaryText: '' }])
            }
            className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <Icon i="plus" size={13} />
            Ajouter un moyen de paiement
          </button>
          <p className="font-body text-xs text-muted-foreground">
            À titre indicatif uniquement — aucun paiement en ligne n&apos;est traité à l&apos;étape
            du devis.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Icon i="file-text" size={16} className="text-muted-foreground" />
            <p className="font-body text-sm font-semibold text-foreground">Note de bas de page</p>
          </div>
          <input
            type="text"
            placeholder="Ex : Merci pour votre confiance !"
            value={footerNote}
            onChange={(e) => setFooterNote(e.target.value)}
            maxLength={1000}
            className={inputClass}
          />
        </div>

        <ContentBlockList
          title="Questions fréquentes"
          icon="help-circle"
          primaryPlaceholder="Question"
          secondaryPlaceholder="Réponse (optionnel)"
          addLabel="Ajouter une question"
          blocks={faqBlocks}
          onChange={setFaqBlocks}
        />
      </section>

      {planLimitMessage && <PlanLimitPrompt message={planLimitMessage} />}
      {error && (
        <p role="alert" className="font-body text-sm text-tag-red-fg">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-canvas/95 px-4 py-3 shadow-xl backdrop-blur sm:-mx-6 lg:-mx-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 font-body text-[11px] text-muted-foreground uppercase">
              Offres au choix
            </p>
            <div className="flex flex-wrap gap-1.5">
              {packs.map((pack, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-1 font-body text-xs font-medium text-foreground"
                >
                  {pack.title.trim() || `Offre ${i + 1}`}
                  <span className="text-muted-foreground">·</span>
                  {formatPrice(packTotals[i] ?? 0, currency)}
                </span>
              ))}
            </div>
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
              type="button"
              onClick={() => void saveQuote('DRAFT')}
              disabled={submitting}
              className="rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : 'Enregistrer brouillon'}
            </button>
            <button
              type="button"
              onClick={() => void saveQuote('SENT')}
              disabled={submitting}
              className="rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : 'Prêt à envoyer'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
