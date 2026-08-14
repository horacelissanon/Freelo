/**
 * POST /api/webhooks/fedapay — Merrudit's own SaaS subscription billing
 * webhook (NOT the end-client-pays-freelancer flow, that's
 * /api/webhooks/bictorys). Thin shim over the same protected generic
 * factory (`lib/server/webhook/handler.ts`) Bictorys uses — see that
 * file's header comment for the raw-body/HMAC/Serializable-tx/dedup
 * invariants it enforces. This file only wires:
 *   - the FedaPay-specific WebhookProvider (lib/server/webhook/fedapay.ts)
 *   - per-event handlers that update Subscription/SubscriptionTransaction
 *     rows + emit an outbox notification on confirmed payment
 *
 * `SubscriptionTransaction.periodStart`/`periodEnd` are computed and stored
 * at POST /api/billing/subscribe time (before the user ever leaves for
 * checkout) — this handler just copies them onto the parent Subscription
 * once FedaPay confirms payment, rather than recomputing the date math here.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { fedapayWebhookProvider } from '@/lib/server/webhook/fedapay';
import { enqueueOutbox } from '@/lib/server/outbox';
import { prisma } from '@/lib/server/prisma';

export const POST = createWebhookHandler({
  prisma,
  provider: fedapayWebhookProvider,

  async onPaid(payload, tx) {
    const externalRef = String(payload.entity?.id ?? payload.id ?? '');
    if (!externalRef) return {};

    const transaction = await tx.subscriptionTransaction.findFirst({
      where: { providerTransactionId: externalRef },
    });
    if (!transaction) return {}; // unknown transaction — log + drop

    await tx.subscriptionTransaction.update({
      where: { id: transaction.id },
      data: { status: 'PAID' },
    });

    const subscription = await tx.subscription.update({
      where: { id: transaction.subscriptionId },
      data: {
        plan: 'PRO',
        status: 'ACTIVE',
        billingCycle: transaction.billingCycle,
        currentPeriodEnd: transaction.periodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    await enqueueOutbox(tx, {
      kind: 'notification.subscription_renewed',
      payload: {
        userId: subscription.userId,
        subscriptionTransactionId: transaction.id,
        plan: subscription.plan,
        currentPeriodEnd: (subscription.currentPeriodEnd ?? new Date()).toISOString(),
      },
    });

    return {};
  },

  async onFailed(payload, tx) {
    const externalRef = String(payload.entity?.id ?? payload.id ?? '');
    if (!externalRef) return {};
    const transaction = await tx.subscriptionTransaction.findFirst({
      where: { providerTransactionId: externalRef },
    });
    if (!transaction) return {};
    await tx.subscriptionTransaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED' },
    });
    return {};
  },
});
