'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { DatePicker } from '@/components/ui/DatePicker';
import { PlanLimitPrompt, isPlanLimitCode } from '@/components/ui/PlanLimitPrompt';
import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_ICONS,
  FREELANCE_SECTOR_LABELS,
  FREELANCE_SECTOR_ICONS,
  SECTOR_PROJECT_TYPES,
  resolveFreelanceSector,
  CURRENCIES,
  PAYMENT_METHOD_LABELS,
  type ProjectType,
  type FreelanceSector,
  type PaymentMethod,
} from '@/lib/constants';
import { PROJECT_TYPE_DEFAULT_STEPS } from '@/lib/projectDefaults';

const FREELANCE_SECTORS = Object.keys(FREELANCE_SECTOR_LABELS) as FreelanceSector[];
const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

interface StepDraft {
  title: string;
  description: string;
}

function stepsTemplateFor(type: ProjectType): StepDraft[] {
  return (PROJECT_TYPE_DEFAULT_STEPS[type] ?? PROJECT_TYPE_DEFAULT_STEPS.OTHER).map((s) => ({
    title: s.title,
    description: s.description,
  }));
}

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

interface ClientOption {
  id: string;
  code: string;
  name: string;
}

interface UnlinkedQuoteRow {
  id: string;
  number: string;
  status: string;
  projectId: string | null;
}

type DepositType = 'NONE' | 'FIXED' | 'PERCENT';

const DEPOSIT_TYPE_LABELS: Record<DepositType, string> = {
  NONE: 'Aucun',
  FIXED: 'Montant fixe',
  PERCENT: 'Taux (%)',
};
const DEPOSIT_TYPES: DepositType[] = ['NONE', 'FIXED', 'PERCENT'];

export interface ProjectFormInitial {
  name?: string;
  sector?: string;
  type?: ProjectType;
  description?: string;
  amount?: number;
  currency?: string;
  depositType?: DepositType;
  depositValue?: number;
  /** Edit-mode only (see `projectId`) — the form otherwise seeds dueDate
   *  empty and steps from the type template, since "initial" elsewhere means
   *  "pre-fill from a devis", not "load this project's saved state". */
  clientId?: string;
  dueDate?: string;
  steps?: { title: string; description?: string | null }[];
}

export function ProjectForm({
  onDone,
  onNeedClient,
  initial,
  lockedClient,
  submitPath = '/api/projects',
  extraBody,
  projectId,
}: {
  onDone: () => void;
  onNeedClient: () => void;
  /** Pre-fills the form — e.g. from an accepted devis, or (with `projectId`
   *  set) an existing draft's saved state. Every field stays editable. */
  initial?: ProjectFormInitial;
  /** When set, the client picker is replaced by a read-only label and
   *  `clientId` is never included in the submitted body — the target
   *  route (e.g. invoices/[id]/create-project) derives it itself, so a
   *  tampered request can't attach the project to a different client. */
  lockedClient?: { id: string; label: string };
  /** Defaults to the standalone creation endpoint; pass a different path
   *  to reuse this exact form for a specialized creation flow. */
  submitPath?: string;
  /** Extra fixed fields merged into the submitted body — e.g. a deposit
   *  confirmation collected in a step before this form is shown. Kept
   *  generic on purpose: this form has no opinion on what those fields mean. */
  extraBody?: Record<string, unknown>;
  /** Edit mode for an existing DRAFT project — saves PATCH /api/projects/{id}
   *  instead of POST submitPath. Mirrors QuoteBuilderForm's `quote` prop. */
  projectId?: string;
}) {
  const { toast } = useToast();
  const { data, loading } = useApi<{ items: ClientOption[] }>('/api/clients?limit=50');
  const clients = data?.items ?? [];

  const resolvedSector = resolveFreelanceSector(initial?.sector, initial?.type);
  const [clientId, setClientId] = useState(lockedClient?.id ?? initial?.clientId ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [sector, setSector] = useState<FreelanceSector>(resolvedSector.code);
  const [sectorOther, setSectorOther] = useState(resolvedSector.other);
  const [type, setType] = useState<ProjectType>(initial?.type ?? 'OTHER');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'XOF');
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '');
  const [dueDate, setDueDate] = useState(initial?.dueDate?.slice(0, 10) ?? '');
  const [steps, setSteps] = useState<StepDraft[]>(() =>
    initial?.steps && initial.steps.length > 0
      ? initial.steps.map((s) => ({ title: s.title, description: s.description ?? '' }))
      : stepsTemplateFor(initial?.type ?? 'OTHER'),
  );
  const [stepsTouched, setStepsTouched] = useState(false);
  // Deposit terms expected for this project going forward — what's owed, not
  // what's already been paid (see depositReceived below). System default
  // mirrors the schema: PERCENT at 50%.
  const [depositType, setDepositType] = useState<DepositType>(initial?.depositType ?? 'PERCENT');
  const [depositTypeValue, setDepositTypeValue] = useState(
    initial?.depositValue != null ? String(initial.depositValue) : '50',
  );
  // Only relevant for the standalone creation path — the devis->projet flow
  // (lockedClient set) already asks this question, up front, as its own
  // wizard step before this form is even shown (see invoices/[id]/page.tsx).
  // Left unchecked by default: "leave it blank" is a valid, common answer,
  // not the same as declaring "no deposit was received".
  const [depositReceived, setDepositReceived] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<PaymentMethod | ''>('');
  const [depositPaymentMethodOther, setDepositPaymentMethodOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    clientId?: string | undefined;
    name?: string | undefined;
    amount?: string | undefined;
  }>({});
  const clientRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Heads-up only, never a blocker: catches the case where the freelance
  // uses the standalone "Nouveau projet" form for a client that already has
  // an unlinked devis, forgetting the dedicated "Créer un projet depuis ce
  // devis" flow (which pre-fills amount/deposit and links Invoice.projectId).
  // Skipped entirely when lockedClient is set — that IS the dedicated flow.
  const { data: quotesData } = useApi<{ items: UnlinkedQuoteRow[] }>(
    clientId ? `/api/invoices?docType=QUOTE&clientId=${clientId}&limit=20` : '',
    { skip: !clientId || !!lockedClient },
  );
  const unlinkedQuotes = (quotesData?.items ?? []).filter(
    (q) => q.status !== 'CANCELED' && !q.projectId,
  );
  const highlightedQuote = unlinkedQuotes.find((q) => q.status === 'ACCEPTED') ?? unlinkedQuotes[0];
  const [importingQuote, setImportingQuote] = useState(false);
  const [importedQuoteId, setImportedQuoteId] = useState<string | null>(null);

  // Same field-seeding as the dedicated "Créer un projet depuis ce devis"
  // flow, but inline: fetches the devis and fills the already-open form
  // instead of navigating away. Does NOT link Invoice.projectId back to the
  // new project — that link only exists inside create-project's own
  // transaction, unreachable from this generic POST /api/projects path.
  async function importFromQuote() {
    if (!highlightedQuote) return;
    setImportingQuote(true);
    try {
      const data = await api<{
        description: string | null;
        sector: string | null;
        type: string | null;
        amount: number;
        currency: string;
        selectedPackId: string | null;
        packs: {
          id: string;
          title: string;
          description: string | null;
          depositType: string | null;
          depositValue: number | null;
        }[];
      }>(`/api/invoices/${highlightedQuote.id}`);
      const selectedPack = data.packs.find((p) => p.id === data.selectedPackId) ?? null;
      const newType = (data.type as ProjectType | null) ?? 'OTHER';
      setName(data.description || selectedPack?.title || '');
      if (selectedPack?.description) setDescription(selectedPack.description);
      if (data.sector) {
        const resolved = resolveFreelanceSector(data.sector, newType);
        setSector(resolved.code);
        setSectorOther(resolved.other);
      }
      setType(newType);
      setAmount(String(data.amount));
      setCurrency(data.currency);
      if (selectedPack?.depositType === 'FIXED' || selectedPack?.depositType === 'PERCENT') {
        setDepositType(selectedPack.depositType);
        setDepositTypeValue(String(selectedPack.depositValue ?? 0));
      }
      if (!stepsTouched) setSteps(stepsTemplateFor(newType));
      setImportedQuoteId(highlightedQuote.id);
      toast('Données du devis importées.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Impossible d'importer les données.", 'error');
    } finally {
      setImportingQuote(false);
    }
  }

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    if (!clientId) errors.clientId = 'Sélectionnez un client.';
    if (!name.trim()) errors.name = 'Le nom du projet est obligatoire.';
    if (!amount || Number(amount) <= 0) errors.amount = 'Indiquez un montant supérieur à 0.';
    setFieldErrors(errors);
    const firstInvalidRef = errors.clientId ? clientRef : errors.name ? nameRef : amountRef;
    if (Object.keys(errors).length > 0) {
      firstInvalidRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalidRef.current?.focus();
    }
    return Object.keys(errors).length === 0;
  }

  function updateStep(index: number, field: keyof StepDraft, value: string) {
    setStepsTouched(true);
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }
  function addStep() {
    setStepsTouched(true);
    setSteps((prev) => [...prev, { title: '', description: '' }]);
  }
  function removeStep(index: number) {
    setStepsTouched(true);
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveProject(targetStatus: 'DRAFT' | 'PENDING') {
    // Same validation for both targets — mirrors QuoteBuilderForm.saveQuote,
    // which validates identically regardless of DRAFT vs SENT. A brouillon
    // just isn't finalized/sent to the client yet and doesn't count against
    // the plan limit — it isn't a "fill in less" mode.
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    setPlanLimitMessage(null);
    try {
      const builtSteps = steps
        .map((s) => ({ title: s.title.trim(), description: s.description.trim() }))
        .filter((s) => s.title)
        .map(({ title, description }) => ({ title, ...(description ? { description } : {}) }));
      const body = {
        ...(lockedClient ? {} : { clientId }),
        name,
        sector: sector === 'OTHER' ? sectorOther.trim() || 'OTHER' : sector,
        type,
        amount: Number(amount),
        currency,
        status: targetStatus,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
        ...(builtSteps.length > 0 ? { steps: builtSteps } : {}),
        depositType,
        depositValue: Number(depositTypeValue || 0),
        ...(!lockedClient && depositReceived
          ? {
              depositReceived: true,
              depositAmount: Number(depositAmount),
              paymentMethod: depositPaymentMethod,
              ...(depositPaymentMethod === 'OTHER'
                ? { paymentMethodLabel: depositPaymentMethodOther.trim() }
                : {}),
            }
          : {}),
        ...extraBody,
      };
      if (projectId) {
        await api(`/api/projects/${projectId}`, { method: 'PATCH', body });
      } else {
        await api(submitPath, { method: 'POST', body });
      }
      invalidateCachePrefix('/api/projects');
      invalidateCachePrefix('/api/dashboard/stats');
      toast(targetStatus === 'PENDING' ? 'Projet créé.' : 'Brouillon enregistré.', 'success');
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
    void saveProject('DRAFT');
  }

  const depositTermsValid =
    depositType === 'NONE' ||
    (Number(depositTypeValue) > 0 &&
      (depositType !== 'PERCENT' || Number(depositTypeValue) <= 100) &&
      (depositType !== 'FIXED' || Number(depositTypeValue) <= Number(amount || 0)));

  const depositValid =
    !depositReceived ||
    (Number(depositAmount) > 0 &&
      Number(depositAmount) <= Number(amount || 0) &&
      !!depositPaymentMethod &&
      (depositPaymentMethod !== 'OTHER' || depositPaymentMethodOther.trim().length > 0));

  if (!lockedClient && !loading && clients.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-body text-sm text-muted-foreground">
          Vous devez d&apos;abord ajouter un client avant de créer un projet.
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
              if (fieldErrors.clientId)
                setFieldErrors((prev) => ({ ...prev, clientId: undefined }));
            }}
            aria-invalid={!!fieldErrors.clientId}
            className={
              fieldErrors.clientId
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
          {fieldErrors.clientId && (
            <span role="alert" className="font-body text-xs font-normal text-tag-red-fg">
              {fieldErrors.clientId}
            </span>
          )}
        </label>
      )}
      {highlightedQuote && highlightedQuote.id !== importedQuoteId && (
        <div className="flex items-start gap-2 rounded-lg bg-tag-orange p-3">
          <Icon i="alert-circle" size={16} className="mt-0.5 flex-shrink-0 text-tag-orange-fg" />
          <div className="flex flex-col gap-1">
            <p className="font-body text-sm text-tag-orange-fg">
              {highlightedQuote.status === 'ACCEPTED'
                ? `Ce client a un devis accepté (${highlightedQuote.number}) non encore transformé en projet. Utilise « Créer un projet depuis ce devis » pour reprendre le montant et l'acompte.`
                : `Ce client a un devis en cours (${highlightedQuote.number}) qui ne sera pas lié à ce projet.`}
            </p>
            <div className="flex items-center gap-3">
              <Link
                href={`/invoices/${highlightedQuote.id}`}
                onClick={onDone}
                className="self-start font-body text-xs font-semibold text-tag-orange-fg underline"
              >
                Voir le devis
              </Link>
              <button
                type="button"
                onClick={() => void importFromQuote()}
                disabled={importingQuote}
                className="self-start font-body text-xs font-semibold text-tag-orange-fg underline disabled:opacity-50"
              >
                {importingQuote ? 'Import…' : 'Importer les données'}
              </button>
            </div>
          </div>
        </div>
      )}
      <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Nom du projet *
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
          }}
          aria-invalid={!!fieldErrors.name}
          className={
            fieldErrors.name
              ? `${inputClass} border-tag-red-fg focus:ring-tag-red-fg/40`
              : inputClass
          }
        />
        {fieldErrors.name && (
          <span role="alert" className="font-body text-xs font-normal text-tag-red-fg">
            {fieldErrors.name}
          </span>
        )}
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
                setType(newType);
                if (!stepsTouched) setSteps(stepsTemplateFor(newType));
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
                  setType(value);
                  if (!stepsTouched) setSteps(stepsTemplateFor(value));
                }}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  type === value
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
      <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Brief (optionnel)
        <textarea
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </label>
      <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Devise du projet
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
        <p className="font-body text-xs text-muted-foreground">
          S’applique au montant du projet ci-dessous.
        </p>
      </div>
      <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Montant ({currency}) *
        <input
          ref={amountRef}
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            if (fieldErrors.amount) setFieldErrors((prev) => ({ ...prev, amount: undefined }));
          }}
          aria-invalid={!!fieldErrors.amount}
          className={
            fieldErrors.amount
              ? `${inputClass} border-tag-red-fg focus:ring-tag-red-fg/40`
              : inputClass
          }
        />
        {fieldErrors.amount && (
          <span role="alert" className="font-body text-xs font-normal text-tag-red-fg">
            {fieldErrors.amount}
          </span>
        )}
      </label>
      <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Acompte pour cette offre
        <div className="flex flex-wrap gap-2">
          {DEPOSIT_TYPES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setDepositType(value);
                if (value === 'NONE') setDepositReceived(false);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                depositType === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-canvas text-foreground'
              }`}
            >
              {DEPOSIT_TYPE_LABELS[value]}
            </button>
          ))}
        </div>
        {depositType !== 'NONE' && (
          <input
            type="number"
            min={1}
            step={1}
            max={depositType === 'PERCENT' ? 100 : undefined}
            value={depositTypeValue}
            onChange={(e) => setDepositTypeValue(e.target.value)}
            placeholder={depositType === 'PERCENT' ? 'Taux en %' : `Montant en ${currency}`}
            className={`${inputClass} mt-1 max-w-[160px]`}
          />
        )}
      </div>
      {!lockedClient && depositType !== 'NONE' && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <label className="flex items-center gap-2 font-body text-sm text-foreground">
            <input
              type="checkbox"
              checked={depositReceived}
              onChange={(e) => {
                const checked = e.target.checked;
                setDepositReceived(checked);
                if (checked && !depositAmount) {
                  const total = Number(amount || 0);
                  // depositType is guaranteed FIXED/PERCENT here — this whole
                  // section only renders when depositType !== 'NONE'.
                  const estimate =
                    depositType === 'FIXED'
                      ? Number(depositTypeValue || 0)
                      : Math.round((total * Number(depositTypeValue || 0)) / 100);
                  setDepositAmount(estimate > 0 ? String(estimate) : '');
                }
              }}
            />
            Un acompte a déjà été reçu
          </label>
          <p className="font-body text-xs text-muted-foreground">
            Laisse cette case décochée si aucun acompte n&apos;a encore été versé, ou si tu préfères
            l&apos;enregistrer plus tard.
          </p>
          {depositReceived && (
            <div className="mt-1 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                Montant reçu ({currency})
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className={inputClass}
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
                    className={`${inputClass} mt-1`}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Échéance
        <DatePicker value={dueDate} onChange={setDueDate} />
      </label>
      <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Étapes du projet
        <div className="flex flex-col gap-2">
          {steps.map((step, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  type="text"
                  value={step.title}
                  onChange={(e) => updateStep(index, 'title', e.target.value)}
                  placeholder={`Titre de l'étape ${index + 1}`}
                  maxLength={200}
                  className={inputClass}
                />
                <input
                  type="text"
                  value={step.description}
                  onChange={(e) => updateStep(index, 'description', e.target.value)}
                  placeholder="Description (optionnel)"
                  maxLength={500}
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={() => removeStep(index)}
                disabled={steps.length <= 1}
                aria-label="Retirer cette étape"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30"
              >
                <Icon i="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-1 flex w-fit items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
        >
          <Icon i="plus" size={13} />
          Ajouter une étape
        </button>
      </div>
      {planLimitMessage && <PlanLimitPrompt message={planLimitMessage} />}
      {error && (
        <p role="alert" className="font-body text-sm text-tag-red-fg">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void saveProject('DRAFT')}
          disabled={submitting || !depositTermsValid || !depositValid}
          className="rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
        >
          Enregistrer brouillon
        </button>
        <button
          type="button"
          onClick={() => void saveProject('PENDING')}
          disabled={submitting || !depositTermsValid || !depositValid}
          className="rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Enregistrement…' : 'Créer projet'}
        </button>
      </div>
    </form>
  );
}
