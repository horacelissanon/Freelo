'use client';

import { useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { DatePicker } from '@/components/ui/DatePicker';
import { PlanLimitPrompt, isPlanLimitCode } from '@/components/ui/PlanLimitPrompt';
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_ICONS,
  CURRENCIES,
  type ProjectStatus,
  type ProjectType,
} from '@/lib/constants';

const PROJECT_TYPES = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];

interface StepDraft {
  title: string;
  description: string;
}

// Pre-filled with the same titles/descriptions as the server's DEFAULT_STEPS
// fallback (see /api/projects) so a user who touches nothing gets identical
// behavior — but every line is editable/removable and more can be added.
const DEFAULT_STEPS: StepDraft[] = [
  { title: 'Brief & découverte', description: 'Collecte de vos informations et objectifs' },
  { title: 'Premiers concepts', description: 'Premières propositions à valider' },
  { title: 'Révisions', description: 'Ajustements selon vos retours' },
  { title: 'Livraison finale', description: 'Remise des fichiers finaux' },
];

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

interface ClientOption {
  id: string;
  code: string;
  name: string;
}

export interface ProjectFormInitial {
  name?: string;
  type?: ProjectType;
  description?: string;
  amount?: number;
  currency?: string;
}

export function ProjectForm({
  onDone,
  onNeedClient,
  initial,
  lockedClient,
  submitPath = '/api/projects',
}: {
  onDone: () => void;
  onNeedClient: () => void;
  /** Pre-fills the form — e.g. from an accepted devis. Every field stays
   *  editable; this only seeds the initial values, same as a user typing
   *  them in by hand. */
  initial?: ProjectFormInitial;
  /** When set, the client picker is replaced by a read-only label and
   *  `clientId` is never included in the submitted body — the target
   *  route (e.g. invoices/[id]/create-project) derives it itself, so a
   *  tampered request can't attach the project to a different client. */
  lockedClient?: { id: string; label: string };
  /** Defaults to the standalone creation endpoint; pass a different path
   *  to reuse this exact form for a specialized creation flow. */
  submitPath?: string;
}) {
  const { toast } = useToast();
  const { data, loading } = useApi<{ items: ClientOption[] }>('/api/clients?limit=50');
  const clients = data?.items ?? [];

  const [clientId, setClientId] = useState(lockedClient?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<ProjectType>(initial?.type ?? 'OTHER');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'XOF');
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '');
  const [status, setStatus] = useState<ProjectStatus>('IN_PROGRESS');
  const [dueDate, setDueDate] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>(DEFAULT_STEPS);
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
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { title: '', description: '' }]);
  }
  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    setPlanLimitMessage(null);
    try {
      const builtSteps = steps
        .map((s) => ({ title: s.title.trim(), description: s.description.trim() }))
        .filter((s) => s.title)
        .map(({ title, description }) => ({ title, ...(description ? { description } : {}) }));
      await api(submitPath, {
        method: 'POST',
        body: {
          ...(lockedClient ? {} : { clientId }),
          name,
          type,
          amount: Number(amount),
          currency,
          status,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
          ...(builtSteps.length > 0 ? { steps: builtSteps } : {}),
        },
      });
      invalidateCachePrefix('/api/projects');
      invalidateCachePrefix('/api/dashboard/stats');
      toast('Projet créé.', 'success');
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
        Type de projet
        <div className="flex flex-wrap gap-2">
          {PROJECT_TYPES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
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
      <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Statut
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          className={inputClass}
        >
          {(Object.entries(PROJECT_STATUS_LABELS) as [ProjectStatus, string][]).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
      </label>
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
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? 'Création…' : 'Créer le projet'}
      </button>
    </form>
  );
}
