// Public, unauthenticated Client Link Portal (Phase C). Deliberately
// outside the (app) route group: no sidebar, no auth gate, no
// CreateMenuProvider. Uses plain fetch (not lib/api.ts) throughout — this
// page has no session, no CSRF token, and shouldn't pull in machinery built
// for the authenticated app.
'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { formatPrice, formatDate } from '@/lib/utils';
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  STEP_STATUS_LABELS,
  STEP_STATUS_COLORS,
  type ProjectStatus,
  type ProjectStepStatus,
} from '@/lib/constants';

interface ClientProjectRow {
  id: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  amount: number;
  currency: string;
  dueDate: string | null;
  step: string | null;
  publicToken: string;
}

interface ClientView {
  kind: 'client';
  client: { name: string };
  projects: ClientProjectRow[];
}

interface ProjectStep {
  id: string;
  order: number;
  title: string;
  description: string | null;
  status: ProjectStepStatus;
  completedAt: string | null;
}

interface ProjectComment {
  id: string;
  author: 'FREELANCER' | 'CLIENT';
  body: string;
  createdAt: string;
}

interface ProjectView {
  kind: 'project';
  project: {
    id: string;
    name: string;
    status: ProjectStatus;
    progress: number;
    amount: number;
    currency: string;
    dueDate: string | null;
    step: string | null;
    depositPercent: number;
    createdAt: string;
    client: { name: string };
  };
  steps: ProjectStep[];
  comments: ProjectComment[];
  deposit: { amount: number; paid: boolean };
  balance: { amount: number; paid: boolean };
}

type TrackView = ClientView | ProjectView;

function Brand() {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
        <span className="font-headings text-lg font-bold text-primary-foreground">F</span>
      </div>
      <span className="font-headings text-xl font-bold tracking-tight text-foreground">Freelo</span>
    </div>
  );
}

export default function TrackingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [view, setView] = useState<TrackView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/track/${token}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Ce lien de suivi est invalide ou n'existe plus.");
        return;
      }
      setError(null);
      setView(data);
    } catch {
      setError('Impossible de charger le suivi pour le moment.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <Brand />

      {loading ? (
        <div className="h-40 animate-pulse rounded-lg border border-border bg-muted" />
      ) : error || !view ? (
        <div className="rounded-lg border border-border bg-canvas shadow-card p-6 text-center">
          <p className="font-body text-sm text-foreground">
            {error ?? 'Lien de suivi introuvable.'}
          </p>
        </div>
      ) : view.kind === 'client' ? (
        <ClientProjectsList view={view} />
      ) : (
        <ProjectDetail view={view} token={token} onRefresh={load} />
      )}
    </main>
  );
}

function ClientProjectsList({ view }: { view: ClientView }) {
  return (
    <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
      <p className="font-body text-xs tracking-widest text-muted-foreground uppercase">
        Suivi client
      </p>
      <h1 className="mt-1 font-headings text-2xl font-bold text-foreground">{view.client.name}</h1>
      <p className="mt-1 font-body text-sm text-muted-foreground">
        {view.projects.length} projet{view.projects.length !== 1 ? 's' : ''}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {view.projects.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">Aucun projet pour le moment.</p>
        ) : (
          view.projects.map((p) => {
            const colors = PROJECT_STATUS_COLORS[p.status];
            return (
              <Link
                key={p.id}
                href={`/suivi/${p.publicToken}`}
                className="flex items-center justify-between gap-4 rounded-md border border-border p-4 font-body hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(p.amount)} {p.currency}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.fg}`}
                >
                  {PROJECT_STATUS_LABELS[p.status]}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function ProjectDetail({
  view,
  token,
  onRefresh,
}: {
  view: ProjectView;
  token: string;
  onRefresh: () => void;
}) {
  const { project, steps, comments, deposit, balance } = view;
  const statusColors = PROJECT_STATUS_COLORS[project.status];

  const [payingKind, setPayingKind] = useState<'DEPOSIT' | 'BALANCE' | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  async function pay(kind: 'DEPOSIT' | 'BALANCE') {
    setPayingKind(kind);
    setPayError(null);
    try {
      const res = await fetch(`/api/track/${token}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.message ?? 'Paiement indisponible pour le moment.');
        return;
      }
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch {
      setPayError('Erreur réseau. Réessayez.');
    } finally {
      setPayingKind(null);
    }
  }

  async function onSubmitComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPosting(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/track/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommentError(data.message ?? "Le commentaire n'a pas pu être envoyé.");
        return;
      }
      setCommentBody('');
      onRefresh();
    } catch {
      setCommentError('Erreur réseau. Réessayez.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
        <p className="font-body text-xs tracking-widest text-muted-foreground uppercase">
          Suivi de projet — {project.client.name}
        </p>
        <h1 className="mt-1 font-headings text-2xl font-bold text-foreground">{project.name}</h1>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-border p-3">
            <p className="font-body text-xs text-muted-foreground">Budget</p>
            <p className="font-headings text-sm font-bold text-foreground">
              {formatPrice(project.amount)} {project.currency}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="font-body text-xs text-muted-foreground">Échéance</p>
            <p className="font-headings text-sm font-bold text-foreground">
              {project.dueDate ? formatDate(project.dueDate) : '—'}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="font-body text-xs text-muted-foreground">Avancement</p>
            <p className="font-headings text-sm font-bold text-foreground">{project.progress}%</p>
          </div>
          <div className={`rounded-md p-3 ${statusColors.bg}`}>
            <p className={`font-body text-xs ${statusColors.fg} opacity-80`}>Statut</p>
            <p className={`font-headings text-sm font-bold ${statusColors.fg}`}>
              {PROJECT_STATUS_LABELS[project.status]}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
        <h2 className="mb-4 font-headings text-base font-bold text-foreground">Étapes du projet</h2>
        <div className="flex flex-col gap-3">
          {steps.map((step) => {
            const colors = STEP_STATUS_COLORS[step.status];
            return (
              <div
                key={step.id}
                className="flex items-start gap-3 rounded-md border border-border p-4"
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-body text-xs font-bold text-foreground">
                  {step.status === 'COMPLETED' ? (
                    <Icon i="check-circle" size={16} className="text-tag-green-fg" />
                  ) : (
                    step.order
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-body text-sm font-medium text-foreground">{step.title}</p>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 font-body text-xs font-medium ${colors.bg} ${colors.fg}`}
                    >
                      {STEP_STATUS_LABELS[step.status]}
                    </span>
                  </div>
                  {step.description && (
                    <p className="mt-0.5 font-body text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  )}
                  {step.completedAt && (
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      Complétée le {formatDate(step.completedAt)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
        <h2 className="mb-4 font-headings text-base font-bold text-foreground">Paiements</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4">
            <div>
              <p className="font-body text-sm font-medium text-foreground">
                Acompte ({project.depositPercent}%)
              </p>
              <p className="font-body text-xs text-muted-foreground">À la signature du projet</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-headings text-lg font-bold text-foreground">
                {formatPrice(deposit.amount)}
              </p>
              {deposit.paid ? (
                <span className="rounded-md bg-tag-green px-2.5 py-1.5 font-body text-xs font-medium text-tag-green-fg">
                  Payé
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => pay('DEPOSIT')}
                  disabled={payingKind !== null}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-body text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  <Icon i="smartphone" size={14} />
                  {payingKind === 'DEPOSIT' ? '…' : 'Payer via Mobile'}
                </button>
              )}
            </div>
          </div>

          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4 ${!deposit.paid ? 'opacity-50' : ''}`}
          >
            <div>
              <p className="font-body text-sm font-medium text-foreground">Solde</p>
              <p className="font-body text-xs text-muted-foreground">À la livraison finale</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-headings text-lg font-bold text-foreground">
                {formatPrice(balance.amount)}
              </p>
              {balance.paid ? (
                <span className="rounded-md bg-tag-green px-2.5 py-1.5 font-body text-xs font-medium text-tag-green-fg">
                  Payé
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => pay('BALANCE')}
                  disabled={payingKind !== null || !deposit.paid}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-body text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  <Icon i="smartphone" size={14} />
                  {payingKind === 'BALANCE' ? '…' : 'Payer via Mobile'}
                </button>
              )}
            </div>
          </div>
          {payError && (
            <p role="alert" className="font-body text-sm text-tag-red-fg">
              {payError}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
        <h2 className="mb-4 font-headings text-base font-bold text-foreground">Commentaires</h2>
        <div className="flex flex-col gap-3">
          {comments.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground">
              Aucun commentaire pour le moment.
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="border-b border-border pb-3 last:border-b-0">
                <div className="flex items-center gap-2">
                  <p className="font-body text-xs font-semibold text-foreground">
                    {c.author === 'CLIENT' ? 'Vous' : 'Freelance'}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    {formatDate(c.createdAt)}
                  </p>
                </div>
                <p className="mt-0.5 font-body text-sm text-foreground">{c.body}</p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSubmitComment} className="mt-4 flex items-center gap-2">
          <input
            type="text"
            placeholder="Votre commentaire…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            maxLength={2000}
            className="min-w-0 flex-1 rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={posting || !commentBody.trim()}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Icon i="send" size={14} />
            Envoyer
          </button>
        </form>
        {commentError && (
          <p role="alert" className="mt-2 font-body text-sm text-tag-red-fg">
            {commentError}
          </p>
        )}
      </div>
    </div>
  );
}
