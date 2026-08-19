// Paramètres → Support. Freelancer-facing ticket submission +
// self-service history. Triage happens from the Super Admin console
// (/admin/support) — see api/support-tickets/route.ts for the split
// between this (own-tickets only) and the admin listing (all tickets).
'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCache } from '@/lib/useApi';
import { Icon } from '@/components/ui/Icon';
import { formatLongDate } from '@/lib/utils';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

// Predefined reason categories for the "Sujet" dropdown — covers the
// support-request shapes we actually see, with a trailing "Autre" that
// reveals a free-text field so nothing is ever forced into the wrong box.
const SUBJECT_MOTIFS = [
  'Facturation & paiements',
  'Problème technique / bug',
  'Question sur mon abonnement',
  'Compte & sécurité',
  "Suggestion d'amélioration",
] as const;
const OTHER_MOTIF = '__other__';

interface TicketRow {
  id: string;
  subject: string;
  message: string;
  priority: Priority;
  status: Status;
  createdAt: string;
}

const STATUS_LABELS: Record<Status, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
};
const STATUS_COLORS: Record<Status, { bg: string; fg: string }> = {
  OPEN: { bg: 'bg-tag-red', fg: 'text-tag-red-fg' },
  IN_PROGRESS: { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg' },
  RESOLVED: { bg: 'bg-tag-green', fg: 'text-tag-green-fg' },
};

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

export function SupportTab() {
  const { toast } = useToast();
  const { data, loading } = useApi<{ items: TicketRow[] }>('/api/support-tickets');
  const [subjectMotif, setSubjectMotif] = useState<string>(SUBJECT_MOTIFS[0]);
  const [customSubject, setCustomSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const subject = subjectMotif === OTHER_MOTIF ? customSubject.trim() : subjectMotif;
    setSubmitting(true);
    try {
      await api('/api/support-tickets', {
        method: 'POST',
        body: { subject, message: message.trim(), priority },
      });
      toast('Ticket envoyé — notre équipe vous répondra rapidement.');
      setSubjectMotif(SUBJECT_MOTIFS[0]);
      setCustomSubject('');
      setMessage('');
      setPriority('MEDIUM');
      invalidateCache('/api/support-tickets');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-lg border border-border bg-canvas shadow-card p-5"
      >
        <div>
          <h2 className="font-headings text-base font-semibold text-foreground">
            Contacter le support
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            Une question, un bug, une demande ? Décrivez-nous ça, on revient vers vous.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-foreground">Sujet</span>
          <select
            required
            value={subjectMotif}
            onChange={(e) => setSubjectMotif(e.target.value)}
            className={inputClass}
          >
            {SUBJECT_MOTIFS.map((motif) => (
              <option key={motif} value={motif}>
                {motif}
              </option>
            ))}
            <option value={OTHER_MOTIF}>Autre</option>
          </select>
        </label>
        {subjectMotif === OTHER_MOTIF && (
          <label className="flex flex-col gap-1.5">
            <span className="font-body text-sm font-medium text-foreground">Précisez le sujet</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={200}
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder="Ex : Facture non envoyée au client"
              className={inputClass}
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-foreground">Message</span>
          <textarea
            required
            minLength={10}
            maxLength={5000}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Décrivez votre problème ou votre question…"
            className={`${inputClass} resize-none`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-foreground">Priorité</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={inputClass}
          >
            <option value="LOW">Basse</option>
            <option value="MEDIUM">Moyenne</option>
            <option value="HIGH">Haute</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Envoi…' : 'Envoyer'}
        </button>
      </form>

      <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
        <h2 className="mb-3 font-headings text-base font-semibold text-foreground">Mes demandes</h2>
        {loading ? (
          <p className="font-body text-sm text-muted-foreground">Chargement…</p>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Icon i="message-circle" size={22} className="text-muted-foreground" />
            <p className="font-body text-sm text-muted-foreground">
              Aucune demande envoyée pour l&apos;instant.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.items.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-body text-sm font-medium text-foreground">
                    {t.subject}
                  </p>
                  <p className="truncate font-body text-xs text-muted-foreground">
                    {formatLongDate(t.createdAt)}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 font-body text-xs font-medium ${STATUS_COLORS[t.status].bg} ${STATUS_COLORS[t.status].fg}`}
                >
                  {STATUS_LABELS[t.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
