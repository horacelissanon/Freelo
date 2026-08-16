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
import { StarRating } from '@/components/ui/StarRating';
import { formatPrice, formatDate } from '@/lib/utils';
import { computeBalance, computePackDeposit } from '@/lib/invoiceTotals';
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  STEP_STATUS_LABELS,
  STEP_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  DOC_TYPE_LABELS,
  type ProjectStatus,
  type ProjectStepStatus,
  type InvoiceStatus,
  type InvoiceDocType,
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

interface ClientInvoiceRow {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  trackingToken: string;
}

interface ClientView {
  kind: 'client';
  client: { name: string };
  projects: ClientProjectRow[];
  invoices: ClientInvoiceRow[];
}

interface TrackedLineItem {
  id: string;
  designation: string;
  quantity: number;
  unitPrice: number;
}

interface TrackedPack {
  id: string;
  title: string;
  description: string | null;
  items: TrackedLineItem[];
  depositType: string | null;
  depositValue: number | null;
}

interface TrackedContentBlock {
  id: string;
  kind: string;
  primaryText: string;
  secondaryText: string | null;
}

interface QuoteOrInvoiceView {
  kind: 'quote' | 'invoice';
  invoice: {
    id: string;
    number: string;
    docType: InvoiceDocType;
    status: InvoiceStatus;
    description: string | null;
    amount: number;
    currency: string;
    issueDate: string;
    dueDate: string | null;
    selectedPackId: string | null;
    client: { name: string };
    lineItems: TrackedLineItem[];
    packs: TrackedPack[];
    contentBlocks: TrackedContentBlock[];
    paymentTermsNote: string | null;
    depositAmount: number | null;
    deliveryDate: string | null;
    paymentMethodNote: string | null;
    footerNote: string | null;
  };
  provider: {
    name: string;
    bio: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    commerceRegistry: string | null;
  };
  // Raw phone, independent of the documentIdentity header choice — needed
  // for the "J'ai envoyé l'acompte" WhatsApp button even when the provider
  // shows a COMPANY identity (which hides provider.phone from the document).
  providerPhone: string | null;
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
  review: { rating: number; comment: string | null } | null;
  deposit: { amount: number; paid: boolean };
  balance: { amount: number; paid: boolean };
}

type TrackView = ClientView | ProjectView | QuoteOrInvoiceView;

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
      ) : view.kind === 'project' ? (
        <ProjectDetail view={view} token={token} onRefresh={load} />
      ) : (
        <QuoteInvoiceDetail view={view} token={token} onRefresh={load} />
      )}
    </main>
  );
}

function ClientProjectsList({ view }: { view: ClientView }) {
  return (
    <div className="animate-fade-in rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
      <div className="relative -mx-6 -mt-6 mb-6 overflow-hidden rounded-t-lg bg-gradient-to-br from-primary to-accent p-6 sm:-mx-8 sm:-mt-8 sm:mb-8 sm:p-8">
        <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <p className="relative font-body text-xs tracking-widest text-white/70 uppercase">
          Suivi client
        </p>
        <h1 className="relative mt-1 font-headings text-2xl font-bold text-white">
          {view.client.name}
        </h1>
        <p className="relative mt-1 font-body text-sm text-white/80">
          {view.projects.length} projet{view.projects.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex flex-col gap-3">
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

      {view.invoices.length > 0 && (
        <>
          <p className="mt-8 font-body text-xs tracking-widest text-muted-foreground uppercase">
            Devis &amp; factures
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {view.invoices.map((inv) => {
              const colors = INVOICE_STATUS_COLORS[inv.status];
              return (
                <Link
                  key={inv.id}
                  href={`/suivi/${inv.trackingToken}`}
                  className="flex items-center justify-between gap-4 rounded-md border border-border p-4 font-body hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {DOC_TYPE_LABELS[inv.docType].long} {inv.number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(inv.amount)} {inv.currency}
                    </p>
                  </div>
                  <div
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.fg}`}
                  >
                    {INVOICE_STATUS_LABELS[inv.status]}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
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
  const { project, steps, comments, review, deposit, balance } = view;

  const [payingKind, setPayingKind] = useState<'DEPOSIT' | 'BALANCE' | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [reviewRating, setReviewRating] = useState(review?.rating ?? 0);
  const [reviewComment, setReviewComment] = useState(review?.comment ?? '');
  const [reviewPosting, setReviewPosting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

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

  async function onSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (reviewRating < 1) return;
    setReviewPosting(true);
    setReviewError(null);
    try {
      const res = await fetch(`/api/track/${token}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReviewError(data.message ?? "L'avis n'a pas pu être envoyé.");
        return;
      }
      onRefresh();
    } catch {
      setReviewError('Erreur réseau. Réessayez.');
    } finally {
      setReviewPosting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in relative overflow-hidden rounded-lg bg-gradient-to-br from-primary to-accent p-6 shadow-card sm:p-8">
        <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <p className="relative font-body text-xs tracking-widest text-white/70 uppercase">
          Suivi de projet — {project.client.name}
        </p>
        <h1 className="relative mt-1 font-headings text-2xl font-bold text-white">
          {project.name}
        </h1>

        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md bg-white/15 p-3 backdrop-blur-sm">
            <p className="font-body text-xs text-white/70">Budget</p>
            <p className="font-headings text-sm font-bold text-white">
              {formatPrice(project.amount)} {project.currency}
            </p>
          </div>
          <div className="rounded-md bg-white/15 p-3 backdrop-blur-sm">
            <p className="font-body text-xs text-white/70">Échéance</p>
            <p className="font-headings text-sm font-bold text-white">
              {project.dueDate ? formatDate(project.dueDate) : '—'}
            </p>
          </div>
          <div className="rounded-md bg-white/15 p-3 backdrop-blur-sm">
            <p className="font-body text-xs text-white/70">Avancement</p>
            <p className="font-headings text-sm font-bold text-white">{project.progress}%</p>
          </div>
          <div className="rounded-md bg-white/20 p-3 backdrop-blur-sm">
            <p className="font-body text-xs text-white/70">Statut</p>
            <p className="font-headings text-sm font-bold text-white">
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

      {project.status === 'DELIVERED' && (
        <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
          <h2 className="mb-4 font-headings text-base font-bold text-foreground">Ton avis</h2>
          <form onSubmit={onSubmitReview} className="flex flex-col gap-3">
            <StarRating value={reviewRating} onChange={setReviewRating} size={26} />
            <textarea
              placeholder="Un mot sur le projet ? (facultatif)"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              maxLength={1000}
              rows={3}
              className="rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={reviewPosting || reviewRating < 1}
              className="flex w-fit items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Icon i="star" size={14} />
              {reviewPosting ? '…' : review ? "Mettre à jour l'avis" : "Envoyer l'avis"}
            </button>
            {reviewError && (
              <p role="alert" className="font-body text-sm text-tag-red-fg">
                {reviewError}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
        <Icon i={icon} size={15} className="text-primary-foreground" />
      </div>
      <h2 className="font-headings text-base font-bold text-foreground">{label}</h2>
    </div>
  );
}

// One offer, one card, its own total — styled like a subscription-plan
// card (name + price up top, feature list, single CTA) rather than an
// invoice-style line-item table. Offers are alternatives the client picks
// ONE of, never a sum, so there is deliberately no grand total anywhere
// near this grid.
function PackPlanCard({
  index,
  pack,
  currency,
  selected,
  selectable,
  onSelect,
}: {
  index: number;
  pack: TrackedPack;
  currency: string;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  const total = pack.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const deposit = computePackDeposit(pack);
  return (
    <div
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onSelect : undefined}
      onKeyDown={
        selectable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={`relative flex flex-col gap-4 rounded-lg border bg-canvas p-5 shadow-card transition-colors ${
        selected ? 'border-2 border-primary' : 'border-border'
      } ${selectable ? 'cursor-pointer hover:border-primary/60' : ''}`}
    >
      {selected && (
        <span className="absolute -top-3 left-4 rounded-full bg-primary px-2.5 py-0.5 font-body text-[11px] font-semibold tracking-wide text-primary-foreground uppercase">
          {selectable ? 'Sélectionnée' : 'Offre retenue'}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-body text-xs font-bold text-primary">
            {index}
          </span>
          <span className="font-headings text-base font-semibold text-foreground">
            {pack.title}
          </span>
        </div>
        <p className="font-headings text-2xl font-bold text-foreground">
          {formatPrice(total, currency)}
        </p>
        {pack.description && (
          <p className="font-body text-xs text-muted-foreground">{pack.description}</p>
        )}
        {deposit != null && (
          <p className="font-body text-xs text-muted-foreground">
            Acompte à l&apos;acceptation :{' '}
            <span className="font-semibold text-foreground">{formatPrice(deposit, currency)}</span>
            {pack.depositType === 'PERCENT' ? ` (${pack.depositValue}%)` : ''}
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {pack.items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 font-body text-sm text-foreground">
            <Icon i="check-circle" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
            <span>
              {item.designation}
              {item.quantity > 1 && (
                <span className="text-muted-foreground"> × {item.quantity}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {selectable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`mt-auto rounded-md px-4 py-2.5 font-body text-sm font-medium ${
            selected ? 'border border-primary text-primary' : 'bg-primary text-primary-foreground'
          }`}
        >
          {selected ? 'Offre choisie' : 'Choisir cette offre'}
        </button>
      )}
    </div>
  );
}

function FaqItem({
  question,
  answer,
  forceOpen,
}: {
  question: string;
  answer: string | null;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = open || forceOpen;
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="font-body text-sm font-medium text-foreground">{question}</span>
        {answer && (
          <Icon
            i={isOpen ? 'chevron-up' : 'chevron-down'}
            size={15}
            className="flex-shrink-0 text-muted-foreground"
          />
        )}
      </button>
      {answer && isOpen && (
        <p className="border-t border-border px-4 py-3 font-body text-sm text-muted-foreground">
          {answer}
        </p>
      )}
    </div>
  );
}

// Shown once the client validates a devis — the freelancer never sees this
// (it's the client's own confirmation + "how do I actually pay" screen).
// The WhatsApp button is a notification, not a payment: no online payment
// happens on a devis, so the client pays the acompte off-platform via one of
// the listed methods, then taps this button to tell the freelancer it's
// done — matching the flow the freelancer described: "l'acompte est déjà
// envoyé, le projet peut démarrer".
function PaymentInfoModal({
  packTitle,
  depositAmount,
  currency,
  paymentTermsNote,
  paymentBlocks,
  whatsappUrl,
  onClose,
}: {
  packTitle: string | null;
  depositAmount: number | null;
  currency: string;
  paymentTermsNote: string | null;
  paymentBlocks: TrackedContentBlock[];
  whatsappUrl: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-canvas p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-tag-green">
              <Icon i="check-circle" size={18} className="text-tag-green-fg" />
            </div>
            <div>
              <h2 className="font-headings text-base font-bold text-foreground">Devis validé !</h2>
              {packTitle && <p className="font-body text-xs text-muted-foreground">{packTitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <Icon i="x" size={16} />
          </button>
        </div>

        {depositAmount != null ? (
          <div className="mb-4 rounded-md border border-border bg-secondary/30 p-4 text-center">
            <p className="font-body text-xs text-muted-foreground uppercase">
              Acompte à régler pour démarrer
            </p>
            <p className="mt-1 font-headings text-2xl font-bold text-foreground">
              {formatPrice(depositAmount, currency)}
            </p>
          </div>
        ) : (
          <p className="mb-4 font-body text-sm text-muted-foreground">
            Nous reviendrons vers vous très prochainement avec les modalités pour démarrer votre
            projet.
          </p>
        )}

        {(paymentTermsNote || paymentBlocks.length > 0) && (
          <div className="mb-4">
            <p className="mb-2 font-body text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Moyens de paiement
            </p>
            {paymentTermsNote && (
              <p className="mb-2 font-body text-sm text-foreground">{paymentTermsNote}</p>
            )}
            {paymentBlocks.length > 0 && (
              <div className="flex flex-col gap-2">
                {paymentBlocks.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5"
                  >
                    <Icon
                      i="credit-card"
                      size={15}
                      className="flex-shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-body text-sm font-medium text-foreground">
                        {b.primaryText}
                      </p>
                      {b.secondaryText && (
                        <p className="truncate font-body text-xs text-muted-foreground">
                          {b.secondaryText}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-tag-green px-4 py-3 font-body text-sm font-semibold text-tag-green-fg hover:opacity-90"
          >
            <Icon i="message-circle" size={16} />
            J&apos;ai envoyé l&apos;acompte
          </a>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}

function QuoteInvoiceDetail({
  view,
  token,
  onRefresh,
}: {
  view: QuoteOrInvoiceView;
  token: string;
  onRefresh: () => void;
}) {
  const { invoice, provider } = view;
  const isQuote = invoice.docType === 'QUOTE';
  const canChoose = isQuote && invoice.status === 'SENT';
  const statusColors = INVOICE_STATUS_COLORS[invoice.status];

  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [forceFaqOpen, setForceFaqOpen] = useState(false);
  const [pendingPackId, setPendingPackId] = useState<string | null>(invoice.selectedPackId);
  const [showAcceptedModal, setShowAcceptedModal] = useState(false);

  useEffect(() => {
    function expandForPrint() {
      setForceFaqOpen(true);
    }
    window.addEventListener('beforeprint', expandForPrint);
    return () => window.removeEventListener('beforeprint', expandForPrint);
  }, []);

  const activePackId = canChoose ? pendingPackId : invoice.selectedPackId;
  const activePack = invoice.packs.find((p) => p.id === activePackId) ?? null;
  const activePackTotal = activePack
    ? activePack.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    : 0;
  const selectedPackDeposit = activePack ? computePackDeposit(activePack) : null;
  const providerPhoneDigits = view.providerPhone?.replace(/[^0-9]/g, '');
  const whatsappMessage = activePack
    ? selectedPackDeposit != null
      ? `Bonjour, j'ai envoyé l'acompte de ${formatPrice(selectedPackDeposit, invoice.currency)} pour le devis ${invoice.number} (${activePack.title}). Le projet peut démarrer !`
      : `Bonjour, j'ai validé le devis ${invoice.number} (${activePack.title}). Le projet peut démarrer !`
    : `Bonjour, j'ai validé le devis ${invoice.number}. Le projet peut démarrer !`;
  const whatsappUrl = providerPhoneDigits
    ? `https://wa.me/${providerPhoneDigits}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  async function validate() {
    if (!pendingPackId) {
      setValidateError('Choisissez une offre ci-dessus avant de valider.');
      return;
    }
    setValidating(true);
    setValidateError(null);
    try {
      const res = await fetch(`/api/track/${token}/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId: pendingPackId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setValidateError(data.message ?? 'Le devis n’a pas pu être validé.');
        return;
      }
      setShowAcceptedModal(true);
      onRefresh();
    } catch {
      setValidateError('Erreur réseau. Réessayez.');
    } finally {
      setValidating(false);
    }
  }

  const processBlocks = invoice.contentBlocks.filter((b) => b.kind === 'PROCESS');
  const conditionBlocks = invoice.contentBlocks.filter((b) => b.kind === 'CONDITIONS');
  const paymentBlocks = invoice.contentBlocks.filter((b) => b.kind === 'PAYMENT_METHOD');
  const faqBlocks = invoice.contentBlocks.filter((b) => b.kind === 'FAQ');
  const docLabel = DOC_TYPE_LABELS[invoice.docType].long;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="animate-fade-in relative overflow-hidden rounded-lg bg-gradient-to-br from-primary to-accent p-6 shadow-card sm:p-8">
        {/* Decorative texture — subtle, doesn't compete with the content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1.5px, transparent 1.5px)',
            backgroundSize: '18px 18px',
          }}
        />
        <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-body text-xs tracking-widest text-white/70 uppercase">
              {docLabel} pour {invoice.client.name}
            </p>
            <h1 className="mt-1 font-headings text-3xl font-bold text-white">{invoice.number}</h1>
            {provider.name && (
              <p className="mt-1 font-body text-sm text-white/80">Préparé par {provider.name}</p>
            )}
            {(provider.address || provider.phone) && (
              <p className="mt-0.5 font-body text-xs text-white/60">
                {provider.address || provider.phone}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1.5 font-body text-xs font-medium text-white backdrop-blur-sm">
              <Icon i={statusColors.icon} size={12} />
              {INVOICE_STATUS_LABELS[invoice.status]}
            </div>
            <a
              href={`/api/track/${token}/pdf`}
              className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 font-body text-xs font-medium text-foreground shadow-sm print:hidden"
            >
              <Icon i="download" size={13} />
              Télécharger
            </a>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/15 px-2.5 py-1 font-body text-xs font-medium text-white backdrop-blur-sm">
            {invoice.client.name}
          </span>
          <span className="rounded-full bg-white/15 px-2.5 py-1 font-body text-xs font-medium text-white backdrop-blur-sm">
            Émis le {formatDate(invoice.issueDate)}
          </span>
          {invoice.dueDate && (
            <span className="rounded-full bg-white/15 px-2.5 py-1 font-body text-xs font-medium text-white backdrop-blur-sm">
              Échéance {formatDate(invoice.dueDate)}
            </span>
          )}
        </div>

        {provider.bio && (
          <p className="relative mt-4 border-t border-white/20 pt-4 font-body text-sm whitespace-pre-wrap text-white/90">
            {provider.bio}
          </p>
        )}
        {(provider.taxId || provider.commerceRegistry) && (
          <p className="relative mt-2 font-body text-xs text-white/60">
            {[
              provider.taxId && `NIF ${provider.taxId}`,
              provider.commerceRegistry && `RCCM ${provider.commerceRegistry}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>

      {isQuote && processBlocks.length > 0 && (
        <div className="animate-slide-up-in rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
          <SectionHeading icon="layers" label="Étapes du projet" />
          <div className="relative flex flex-col gap-6 pl-1">
            {processBlocks.length > 1 && (
              <div
                aria-hidden
                className="absolute top-[18px] bottom-[18px] left-[17px] w-0.5 bg-gradient-to-b from-primary via-primary/40 to-primary/10"
              />
            )}
            {processBlocks.map((b, i) => (
              <div key={b.id} className="relative flex gap-4">
                <div className="relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent font-headings text-sm font-bold text-primary-foreground shadow-sm ring-4 ring-canvas">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1 pt-1.5">
                  <p className="font-body text-sm font-semibold text-foreground">{b.primaryText}</p>
                  {b.secondaryText && (
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      {b.secondaryText}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="animate-slide-up-in rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
        <SectionHeading
          icon={isQuote ? 'layout-grid' : 'receipt'}
          label={isQuote ? 'Nos offres' : 'Prestations'}
        />

        {isQuote ? (
          <>
            <p className="-mt-2 mb-4 font-body text-xs text-muted-foreground">
              {canChoose
                ? 'Choisissez une des offres ci-dessous — chacune a son propre tarif.'
                : 'Ces offres vous ont été présentées au choix.'}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {invoice.packs.map((pack, index) => (
                <PackPlanCard
                  key={pack.id}
                  index={index + 1}
                  pack={pack}
                  currency={invoice.currency}
                  selected={activePackId === pack.id}
                  selectable={canChoose}
                  onSelect={() => setPendingPackId(pack.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            {invoice.lineItems.length > 0 ? (
              invoice.lineItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-b-0"
                >
                  <span className="font-body text-sm text-foreground">
                    {item.designation} × {item.quantity}
                  </span>
                  <span className="font-body text-sm font-medium text-foreground">
                    {formatPrice(item.quantity * item.unitPrice)}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="font-body text-sm text-foreground">
                  {invoice.description || DOC_TYPE_LABELS[invoice.docType].long}
                </span>
                <span className="font-body text-sm font-medium text-foreground">
                  {formatPrice(invoice.amount, invoice.currency)}
                </span>
              </div>
            )}
          </div>
        )}

        {!isQuote && (
          <div className="mt-4 flex justify-end">
            <div className="flex w-full max-w-[220px] items-center justify-between rounded-md bg-secondary px-4 py-2.5">
              <span className="font-body text-xs font-semibold text-muted-foreground uppercase">
                Total
              </span>
              <span className="font-headings text-base font-bold text-foreground">
                {formatPrice(invoice.amount, invoice.currency)}
              </span>
            </div>
          </div>
        )}

        {!isQuote &&
          (invoice.depositAmount != null || invoice.paymentMethodNote || invoice.deliveryDate) && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 font-body text-sm sm:grid-cols-4">
              {invoice.depositAmount != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Acompte</p>
                  <p className="font-medium text-foreground">
                    {formatPrice(invoice.depositAmount, invoice.currency)}
                  </p>
                </div>
              )}
              {invoice.depositAmount != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Solde</p>
                  <p className="font-medium text-foreground">
                    {formatPrice(
                      computeBalance(invoice.amount, invoice.depositAmount),
                      invoice.currency,
                    )}
                  </p>
                </div>
              )}
              {invoice.paymentMethodNote && (
                <div>
                  <p className="text-xs text-muted-foreground">Règlement</p>
                  <p className="font-medium text-foreground">{invoice.paymentMethodNote}</p>
                </div>
              )}
              {invoice.deliveryDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Livraison</p>
                  <p className="font-medium text-foreground">{formatDate(invoice.deliveryDate)}</p>
                </div>
              )}
            </div>
          )}
        {!isQuote && invoice.footerNote && (
          <p className="mt-4 border-t border-border pt-4 font-body text-xs text-muted-foreground italic">
            {invoice.footerNote}
          </p>
        )}
      </div>

      {isQuote && conditionBlocks.length > 0 && (
        <div className="animate-slide-up-in rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
          <SectionHeading icon="shield" label="Conditions" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            {conditionBlocks.map((b) => (
              <div key={b.id} className="flex gap-2.5 rounded-md border border-border p-3">
                <Icon i="shield" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="font-body text-sm font-medium text-foreground">{b.primaryText}</p>
                  {b.secondaryText && (
                    <p className="mt-0.5 font-body text-xs text-muted-foreground">
                      {b.secondaryText}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isQuote && (invoice.paymentTermsNote || paymentBlocks.length > 0) && (
        <div className="animate-slide-up-in rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
          <SectionHeading icon="credit-card" label="Modalités de paiement" />
          {invoice.paymentTermsNote && (
            <p className="font-body text-sm text-foreground">{invoice.paymentTermsNote}</p>
          )}
          {paymentBlocks.length > 0 && (
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
              {paymentBlocks.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5"
                >
                  <Icon i="credit-card" size={15} className="flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm font-medium text-foreground">
                      {b.primaryText}
                    </p>
                    {b.secondaryText && (
                      <p className="truncate font-body text-xs text-muted-foreground">
                        {b.secondaryText}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 font-body text-xs text-muted-foreground">
            À titre indicatif — aucun paiement en ligne n&apos;est traité à l&apos;étape du devis.
          </p>
        </div>
      )}

      {isQuote && faqBlocks.length > 0 && (
        <div className="animate-slide-up-in rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
          <SectionHeading icon="help-circle" label="Questions fréquentes" />
          <div className="flex flex-col gap-2">
            {faqBlocks.map((b) => (
              <FaqItem
                key={b.id}
                question={b.primaryText}
                answer={b.secondaryText}
                forceOpen={forceFaqOpen}
              />
            ))}
          </div>
        </div>
      )}

      <div className="sticky bottom-4 z-10 rounded-lg border border-border bg-canvas/95 p-4 shadow-xl backdrop-blur print:hidden sm:p-5">
        {canChoose && (
          <div className="mb-3 flex flex-wrap gap-2">
            {invoice.packs.map((pack, i) => {
              const total = pack.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
              const isSelected = pendingPackId === pack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setPendingPackId(pack.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-body text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-foreground hover:border-primary/50'
                  }`}
                >
                  {isSelected && <Icon i="check-circle" size={13} />}
                  {i + 1}. {pack.title} · {formatPrice(total, invoice.currency)}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-body text-[11px] text-muted-foreground uppercase">
              {isQuote
                ? activePack
                  ? canChoose
                    ? 'Offre sélectionnée'
                    : 'Offre retenue'
                  : 'Choisissez une offre ci-dessus'
                : 'Total à régler'}
            </p>
            <p className="truncate font-headings text-xl font-bold text-foreground">
              {isQuote
                ? activePack
                  ? `${activePack.title} — ${formatPrice(activePackTotal, invoice.currency)}`
                  : '—'
                : formatPrice(invoice.amount, invoice.currency)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/track/${token}/pdf`}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2.5 font-body text-sm font-medium text-foreground hover:border-primary/40"
            >
              <Icon i="download" size={14} />
              <span className="hidden sm:inline">Télécharger</span>
            </a>
            {canChoose && (
              <button
                type="button"
                onClick={() => void validate()}
                disabled={validating || !pendingPackId}
                className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <Icon i="check-circle" size={15} />
                {validating ? 'Validation…' : 'Valider ce devis'}
              </button>
            )}
          </div>
        </div>
        {isQuote && invoice.status === 'ACCEPTED' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-1.5">
              <Icon i="check-circle" size={15} className="mt-0.5 flex-shrink-0 text-tag-green-fg" />
              <p className="font-body text-sm font-medium text-tag-green-fg">
                Devis validé, merci pour votre confiance !
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAcceptedModal(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-body text-xs font-medium text-foreground hover:border-primary/40"
            >
              <Icon i="credit-card" size={13} />
              Infos de paiement
            </button>
          </div>
        )}
        {isQuote && invoice.status !== 'SENT' && invoice.status !== 'ACCEPTED' && (
          <p className="mt-3 font-body text-sm text-muted-foreground">
            Ce devis est {INVOICE_STATUS_LABELS[invoice.status].toLowerCase()}.
          </p>
        )}
        {validateError && (
          <p role="alert" className="mt-2 font-body text-sm text-tag-red-fg">
            {validateError}
          </p>
        )}
      </div>

      {showAcceptedModal && (
        <PaymentInfoModal
          packTitle={activePack?.title ?? null}
          depositAmount={selectedPackDeposit}
          currency={invoice.currency}
          paymentTermsNote={invoice.paymentTermsNote}
          paymentBlocks={paymentBlocks}
          whatsappUrl={whatsappUrl}
          onClose={() => setShowAcceptedModal(false)}
        />
      )}
    </div>
  );
}
