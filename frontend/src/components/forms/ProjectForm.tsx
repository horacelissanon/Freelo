'use client';

import { useState, type FormEvent } from 'react';
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

// Pre-filled with the same titles as the server's DEFAULT_STEPS fallback
// (see /api/projects) so a user who touches nothing gets identical behavior
// — but every line is editable/removable and more can be added.
const DEFAULT_STEP_TITLES = [
  'Brief & découverte',
  'Premiers concepts',
  'Révisions',
  'Livraison finale',
];

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

interface ClientOption {
  id: string;
  code: string;
  name: string;
}

export function ProjectForm({
  onDone,
  onNeedClient,
}: {
  onDone: () => void;
  onNeedClient: () => void;
}) {
  const { toast } = useToast();
  const { data, loading } = useApi<{ items: ClientOption[] }>('/api/clients?limit=50');
  const clients = data?.items ?? [];

  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('OTHER');
  const [currency, setCurrency] = useState('XOF');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('IN_PROGRESS');
  const [dueDate, setDueDate] = useState('');
  const [steps, setSteps] = useState<string[]>(DEFAULT_STEP_TITLES);
  const [error, setError] = useState<string | null>(null);
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateStep(index: number, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, '']);
  }
  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setPlanLimitMessage(null);
    try {
      const stepTitles = steps.map((s) => s.trim()).filter(Boolean);
      await api('/api/projects', {
        method: 'POST',
        body: {
          clientId,
          name,
          type,
          amount: Number(amount),
          currency,
          status,
          ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
          ...(stepTitles.length > 0 ? { steps: stepTitles.map((title) => ({ title })) } : {}),
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

  if (!loading && clients.length === 0) {
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
      <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Client *
        <select
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
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
      <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
        Nom du projet *
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
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
          type="number"
          required
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClass}
        />
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
          {steps.map((title, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => updateStep(index, e.target.value)}
                placeholder={`Étape ${index + 1}`}
                maxLength={200}
                className={`${inputClass} min-w-0 flex-1`}
              />
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
