'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { formatPrice, formatDate } from '@/lib/utils';
import type { InvoiceDocType } from '@/lib/constants';

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

export function InvoiceForm({
  initialDocType,
  onDone,
  onNeedClient,
}: {
  initialDocType: InvoiceDocType;
  onDone: () => void;
  onNeedClient: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: clientsData, loading: clientsLoading } = useApi<{ items: ClientOption[] }>(
    '/api/clients?limit=50',
  );
  const clients = clientsData?.items ?? [];

  const [docType, setDocType] = useState<InvoiceDocType>(initialDocType);
  const [clientId, setClientId] = useState('');
  const { data: projectsData } = useApi<{ items: ProjectOption[] }>(
    `/api/projects?clientId=${clientId}&limit=50`,
    { skip: !clientId },
  );
  const projects = projectsData?.items ?? [];

  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const studioLabel = user?.studioName || user?.email || '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/invoices', {
        method: 'POST',
        body: {
          clientId,
          docType,
          amount: Number(amount),
          ...(projectId ? { projectId } : {}),
          ...(description ? { description } : {}),
          ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
        },
      });
      invalidateCachePrefix('/api/invoices');
      invalidateCachePrefix('/api/dashboard/stats');
      toast(docType === 'QUOTE' ? 'Devis créé.' : 'Facture créée.', 'success');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!clientsLoading && clients.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-body text-sm text-muted-foreground">
          Vous devez d&apos;abord ajouter un client avant de créer{' '}
          {docType === 'QUOTE' ? 'un devis' : 'une facture'}.
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
        <div className="flex gap-2">
          {(['QUOTE', 'INVOICE'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDocType(value)}
              className={`flex-1 rounded-md border px-3 py-2 font-body text-sm font-medium ${
                docType === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {value === 'QUOTE' ? 'Devis' : 'Facture'}
            </button>
          ))}
        </div>
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
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Montant (XOF) *
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
          Échéance
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </label>
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
          {submitting ? 'Création…' : docType === 'QUOTE' ? 'Créer le devis' : 'Créer la facture'}
        </button>
      </form>

      <div className="lg:w-64 lg:flex-shrink-0">
        <p className="mb-2 font-body text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Aperçu en direct
        </p>
        <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border bg-secondary/40 p-4 font-body">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-headings text-sm font-bold text-foreground">
                {docType === 'QUOTE' ? 'Devis' : 'Facture'}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Numéro attribué à la création
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
          <div className="border-t border-border pt-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-foreground">
                {description ||
                  (docType === 'QUOTE' ? 'Prestation à définir' : 'Prestation facturée')}
              </p>
              <p className="flex-shrink-0 text-sm font-semibold text-foreground">
                {amount ? formatPrice(Number(amount), 'XOF') : '—'}
              </p>
            </div>
          </div>
          {dueDate && (
            <p className="text-[11px] text-muted-foreground">Échéance {formatDate(dueDate)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
