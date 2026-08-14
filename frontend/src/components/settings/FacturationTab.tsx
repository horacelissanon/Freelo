// Merrudit SaaS subscription (the freelancer paying to use the app itself —
// distinct from Bictorys, which stays wired for the freelancer's own
// clients paying them). Real data from GET /api/billing/subscription,
// mutations via POST /api/billing/subscribe (FedaPay redirect checkout,
// no silent recharge) and POST /api/billing/cancel. Exactly 2 plans per
// the PRD — Gratuit (0 FCFA) and Pro (3 500 FCFA/mois ou 35 000 FCFA/an) —
// no Enterprise tier.
'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, invalidateCache } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState } from '@/components/ui/PageStates';
import { formatPrice, formatLongDate } from '@/lib/utils';

// Mirrors lib/server/billing/subscription.ts's PRO_PRICING — duplicated
// here (not imported) because that module is `server-only` and this is a
// client component. Same duplication precedent as the landing page's
// #tarifs section.
const PRO_PRICING = {
  MONTHLY: { amount: 3500 },
  YEARLY: { amount: 35000 },
} as const;

type BillingCycle = keyof typeof PRO_PRICING;

interface SubscriptionData {
  subscription: {
    plan: 'FREE' | 'PRO';
    status: string;
    billingCycle: BillingCycle | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    isProActive: boolean;
  };
  usage: {
    clients: number;
    activeProjects: number;
    limits: { maxClients: number; maxActiveProjects: number };
  };
  transactions: {
    id: string;
    amount: number;
    currency: string;
    billingCycle: string;
    status: 'PENDING' | 'PAID' | 'FAILED';
    createdAt: string;
  }[];
}

const SUBSCRIPTION_PATH = '/api/billing/subscription';

const TX_STATUS_LABEL: Record<string, string> = {
  PAID: 'Payé',
  PENDING: 'En attente',
  FAILED: 'Échoué',
};

const TX_STATUS_CLASS: Record<string, string> = {
  PAID: 'bg-tag-green text-tag-green-fg',
  PENDING: 'bg-tag-orange text-tag-orange-fg',
  FAILED: 'bg-tag-red text-tag-red-fg',
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'PAYMENT_PROVIDER_UNCONFIGURED') {
      return "Le paiement en ligne n'est pas encore configuré. Réessaie plus tard.";
    }
    return err.message;
  }
  return 'Une erreur est survenue.';
}

export function FacturationTab() {
  const { data, loading, error, refresh } = useApi<SubscriptionData>(SUBSCRIPTION_PATH);
  const { toast } = useToast();
  const [pendingCycle, setPendingCycle] = useState<BillingCycle | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  async function subscribe(billingCycle: BillingCycle) {
    setPendingCycle(billingCycle);
    try {
      const res = await api<{ paymentUrl: string | null }>('/api/billing/subscribe', {
        method: 'POST',
        body: { billingCycle },
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
        return;
      }
      toast("Le paiement n'a pas pu démarrer. Réessaie.", 'error');
      setPendingCycle(null);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setPendingCycle(null);
    }
  }

  async function cancelSubscription() {
    setCanceling(true);
    try {
      await api('/api/billing/cancel', { method: 'POST' });
      invalidateCache(SUBSCRIPTION_PATH);
      await refresh();
      toast('Abonnement annulé — reste actif jusqu’à la fin de la période en cours.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setCanceling(false);
      setConfirmCancelOpen(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  const { subscription, usage, transactions } = data;
  const isPro = subscription.isProActive;

  return (
    <div className="flex flex-col gap-6">
      {/* Abonnement actuel */}
      <section className="rounded-lg border border-border bg-canvas p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="font-headings text-lg font-semibold text-foreground">
              Abonnement actuel
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 font-body text-xs font-medium ${
                  isPro
                    ? 'bg-tag-green text-tag-green-fg'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {isPro ? 'Pro' : 'Gratuit'}
              </span>
              {isPro && subscription.currentPeriodEnd && (
                <span className="font-body text-xs text-muted-foreground">
                  {subscription.cancelAtPeriodEnd ? 'Se termine le ' : 'Renouvellement le '}
                  {formatLongDate(subscription.currentPeriodEnd)}
                </span>
              )}
            </div>
          </div>
          {isPro ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => subscribe(subscription.billingCycle ?? 'MONTHLY')}
                disabled={pendingCycle !== null}
                className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground disabled:opacity-50"
              >
                {pendingCycle ? 'Redirection…' : 'Renouveler maintenant'}
              </button>
              {!subscription.cancelAtPeriodEnd && (
                <button
                  type="button"
                  onClick={() => setConfirmCancelOpen(true)}
                  className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-tag-red-fg"
                >
                  Annuler
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => subscribe('MONTHLY')}
              disabled={pendingCycle !== null}
              className="rounded-md bg-primary px-4 py-2 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {pendingCycle ? 'Redirection…' : 'Passer en Pro'}
            </button>
          )}
        </div>
        {!isPro && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-md bg-secondary px-3 py-2">
              <span className="font-body text-xs text-muted-foreground">Clients</span>
              <p className="font-headings text-sm font-semibold text-foreground">
                {usage.clients} / {usage.limits.maxClients}
              </p>
            </div>
            <div className="rounded-md bg-secondary px-3 py-2">
              <span className="font-body text-xs text-muted-foreground">Projets actifs</span>
              <p className="font-headings text-sm font-semibold text-foreground">
                {usage.activeProjects} / {usage.limits.maxActiveProjects}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Autres plans */}
      <section className="flex flex-col gap-3">
        <span className="font-headings text-base font-semibold text-foreground">Plans</span>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-canvas p-5 shadow-card">
            <div className="flex flex-col gap-1">
              <span className="font-headings text-base font-semibold text-foreground">Gratuit</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-headings text-2xl font-bold text-foreground">0 FCFA</span>
              </div>
              <p className="font-body text-xs text-muted-foreground">
                Pour démarrer et tester l&rsquo;outil.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {[
                `${usage.limits.maxClients} client`,
                `${usage.limits.maxActiveProjects} projets actifs`,
                'Devis & factures en FCFA uniquement',
                'Lien de suivi client en lecture seule',
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 font-body text-sm text-foreground"
                >
                  <Icon i="check-circle" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled
              className="mt-auto rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
            >
              {isPro ? 'Plan actuel après annulation' : 'Plan actuel'}
            </button>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border border-primary bg-canvas p-5 shadow-card">
            <div className="flex flex-col gap-1">
              <span className="font-headings text-base font-semibold text-foreground">Pro</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-headings text-2xl font-bold text-foreground">
                  {formatPrice(PRO_PRICING.MONTHLY.amount)}
                </span>
                <span className="font-body text-xs text-muted-foreground">FCFA / mois</span>
              </div>
              <p className="font-body text-xs text-muted-foreground">
                ou {formatPrice(PRO_PRICING.YEARLY.amount)} FCFA / an
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {[
                'Clients & projets illimités',
                'Devis & factures en EUR / USD',
                'Lien de suivi interactif (commentaires, paiement en ligne)',
                'Sans filigrane sur les documents',
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 font-body text-sm text-foreground"
                >
                  <Icon i="check-circle" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
            {isPro ? (
              <button
                type="button"
                disabled
                className="mt-auto rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
              >
                Plan actuel
              </button>
            ) : (
              <div className="mt-auto flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => subscribe('MONTHLY')}
                  disabled={pendingCycle !== null}
                  className="rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {pendingCycle === 'MONTHLY' ? 'Redirection…' : 'Passer en Pro — mensuel'}
                </button>
                <button
                  type="button"
                  onClick={() => subscribe('YEARLY')}
                  disabled={pendingCycle !== null}
                  className="rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
                >
                  {pendingCycle === 'YEARLY' ? 'Redirection…' : 'Passer en Pro — annuel'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Historique de facturation */}
      <section className="flex flex-col gap-3">
        <span className="font-headings text-base font-semibold text-foreground">
          Historique de facturation
        </span>
        {transactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-canvas p-4">
            <p className="font-body text-sm text-muted-foreground">
              Aucune transaction pour le moment.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-canvas shadow-card">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex flex-col">
                  <span className="font-body text-sm font-medium text-foreground">
                    {formatPrice(tx.amount)} {tx.currency} —{' '}
                    {tx.billingCycle === 'MONTHLY' ? 'Mensuel' : 'Annuel'}
                  </span>
                  <span className="font-body text-xs text-muted-foreground">
                    {formatLongDate(tx.createdAt)}
                  </span>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 font-body text-xs font-medium ${TX_STATUS_CLASS[tx.status] ?? 'bg-secondary text-secondary-foreground'}`}
                >
                  {TX_STATUS_LABEL[tx.status] ?? tx.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {confirmCancelOpen && (
        <Modal title="Annuler l'abonnement Pro" onClose={() => setConfirmCancelOpen(false)}>
          <p className="font-body text-sm text-muted-foreground">
            Ton abonnement Pro restera actif jusqu&rsquo;au{' '}
            {subscription.currentPeriodEnd
              ? formatLongDate(subscription.currentPeriodEnd)
              : 'terme'}
            , puis repassera automatiquement en plan Gratuit. Aucun remboursement n&rsquo;est
            applicable.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancelOpen(false)}
              className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
            >
              Retour
            </button>
            <button
              type="button"
              onClick={cancelSubscription}
              disabled={canceling}
              className="rounded-md bg-tag-red-fg px-4 py-2 font-body text-sm font-medium text-white disabled:opacity-50"
            >
              {canceling ? 'Annulation…' : "Confirmer l'annulation"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
