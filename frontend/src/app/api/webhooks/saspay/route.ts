/**
 * POST /api/webhooks/saspay — SasPay checkout payment webhook adapter.
 *
 * Thin shim over the battle-tested factory at `lib/server/webhook/handler.ts`
 * (PROTECTED — never modified). The factory does ALL the hard work: raw-body
 * read via arrayBuffer, HMAC verify, Serializable transaction, WebhookLog
 * upsert + dedup, dispatch, processedAt write-back. This file only wires:
 *   - the SasPay-specific WebhookProvider (signature verify + payload parser)
 *   - per-event handlers that update Order OR SubscriptionTransaction rows
 *     + emit outbox events
 *
 * SasPay is the ACTIVE provider for TWO distinct flows sharing this one
 * endpoint: /api/orders + /api/track/[token]/pay (a freelance's own client
 * paying for a project — updates Order) and /api/billing/subscribe (a
 * freelance paying Merrudit for their Pro plan — updates
 * SubscriptionTransaction/Subscription). Both mint their `externalRef` from
 * a cuid()-based row id, so there's no collision risk; onPaid/onFailed just
 * try Order first, then fall back to SubscriptionTransaction.
 *
 * SasPay has no documented refund webhook event for checkout/transactions
 * (only settlement.* for payouts, which this app doesn't call) — so there's
 * no onRefunded handler here, unlike the (dormant) Bictorys wiring.
 *
 * Matching a real webhook to OUR row (verified live 2026-08-24):
 * `payload.data.id` / `.reference` identify SasPay's per-attempt TRANSACTION,
 * not the checkout SESSION id we stored as providerChargeId /
 * providerTransactionId at charge() time — the two never match in practice
 * (confirmed against real transaction.failed deliveries; SasPay's docs don't
 * expose a session-linking field on that payload either). `onPaid`/`onFailed`
 * still try the direct match first (free, and forward-compatible if SasPay
 * ever aligns the ids), but when it misses, they fall back to a `postCommit`
 * closure that re-verifies every still-PENDING Order/SubscriptionTransaction
 * WE own against `GET /checkout-sessions/{id}/` (see
 * payments/saspay.ts's `verifyCheckoutSession`) and applies whatever
 * authoritative status comes back. This runs after the factory's tx commits,
 * not inside it — verifyCheckoutSession is a real network call, and holding
 * a Serializable transaction open across one is how you get lock timeouts.
 *
 * CLAUDE.md invariants honored here:
 *   - runtime = 'nodejs' is exported below (Buffer/crypto + Prisma — the
 *     runtime-enforcement test fails CI otherwise).
 *   - dynamic = 'force-dynamic' is exported below (prevents accidental POST
 *     caching by Next.js).
 *   - This file NEVER reads the request body. The factory itself reads the
 *     raw bytes for byte-identical HMAC verification — reading the body here
 *     would be a silent HMAC regression.
 *   - Side-effects always go through enqueueOutbox(tx, ...) atomically with
 *     the state change — either inside the factory's own Serializable tx
 *     (direct-match path), or inside a fresh short-lived tx opened by the
 *     postCommit reconciliation (fallback path) — never fire-and-forget.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The reconciliation fallback can fan out to several SasPay API calls
// (parallel, but still real network I/O) — give it more headroom than the
// platform default.
export const maxDuration = 30;

import 'server-only';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { saspayWebhookProvider, getSaspayProviderHandle } from '@/lib/server/webhook/saspay';
import type { SaspayProviderHandle } from '@/lib/server/payments/saspay';
import { enqueueOutbox } from '@/lib/server/outbox';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { incrWithWindow } from '@/lib/server/admin-alerts/counters';
import { createAdminAlert } from '@/lib/server/admin-alerts';
import { webhookSignatureInvalid } from '@/lib/server/admin-alerts/templates';
import { log } from '@/lib/server/observability/log';

const RECONCILE_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000; // bound the scan to recent PENDING rows
const RECONCILE_BATCH_SIZE = 50;

type PendingOrder = Awaited<ReturnType<typeof prisma.order.findMany>>[number];
type PendingSubscriptionTransaction = Awaited<
  ReturnType<typeof prisma.subscriptionTransaction.findMany>
>[number];

async function reconcileOrder(provider: SaspayProviderHandle, order: PendingOrder): Promise<void> {
  if (!order.providerChargeId) return;
  let status: 'PENDING' | 'PAID' | 'FAILED';
  try {
    status = await provider.verifyCheckoutSession(order.providerChargeId);
  } catch (err) {
    log.warn('saspay reconcile: verifyCheckoutSession failed for order', {
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (status === 'PENDING') return;

  await prisma.$transaction(async (innerTx) => {
    const updated = await innerTx.order.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: status === 'PAID' ? { status: 'PAID', paidAt: new Date() } : { status: 'FAILED' },
    });
    if (updated.count === 0) return; // already reconciled by a concurrent run

    if (status === 'PAID') {
      if (order.userId) {
        await enqueueOutbox(innerTx, {
          kind: 'notification.payment_received',
          payload: {
            userId: order.userId,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
          },
        });
      }
      if (order.customerEmail) {
        await enqueueOutbox(innerTx, {
          kind: 'email.payment_confirmation',
          payload: {
            to: order.customerEmail,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
          },
        });
      }
    } else if (order.userId) {
      await enqueueOutbox(innerTx, {
        kind: 'notification.order_payment_failed',
        payload: { userId: order.userId, orderId: order.id },
      });
    }
  });
}

async function reconcileSubscriptionTransaction(
  provider: SaspayProviderHandle,
  transaction: PendingSubscriptionTransaction,
): Promise<void> {
  if (!transaction.providerTransactionId) return;
  let status: 'PENDING' | 'PAID' | 'FAILED';
  try {
    status = await provider.verifyCheckoutSession(transaction.providerTransactionId);
  } catch (err) {
    log.warn('saspay reconcile: verifyCheckoutSession failed for subscription transaction', {
      subscriptionTransactionId: transaction.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (status === 'PENDING') return;

  await prisma.$transaction(async (innerTx) => {
    const updated = await innerTx.subscriptionTransaction.updateMany({
      where: { id: transaction.id, status: 'PENDING' },
      data: { status },
    });
    if (updated.count === 0) return; // already reconciled by a concurrent run

    if (status === 'PAID') {
      const subscription = await innerTx.subscription.update({
        where: { id: transaction.subscriptionId },
        data: {
          plan: 'PRO',
          status: 'ACTIVE',
          billingCycle: transaction.billingCycle,
          currentPeriodEnd: transaction.periodEnd,
          cancelAtPeriodEnd: false,
        },
      });
      await enqueueOutbox(innerTx, {
        kind: 'notification.subscription_renewed',
        payload: {
          userId: subscription.userId,
          subscriptionTransactionId: transaction.id,
          plan: subscription.plan,
          currentPeriodEnd: (subscription.currentPeriodEnd ?? new Date()).toISOString(),
        },
      });
    } else {
      const subscription = await innerTx.subscription.findUnique({
        where: { id: transaction.subscriptionId },
        select: { userId: true },
      });
      if (subscription) {
        await enqueueOutbox(innerTx, {
          kind: 'notification.subscription_payment_failed',
          payload: {
            userId: subscription.userId,
            subscriptionTransactionId: transaction.id,
            amount: transaction.amount,
            currency: transaction.currency,
          },
        });
      }
    }
  });
}

/** postCommit fallback: a paid/failed webhook arrived but its transaction-
 * level id didn't match any providerChargeId/providerTransactionId we have
 * on file — re-verify every recent PENDING row we own against SasPay
 * directly instead of trusting the payload's ids (see file header). */
async function reconcilePendingSaspayPayments(): Promise<void> {
  let provider: SaspayProviderHandle;
  try {
    provider = getSaspayProviderHandle();
  } catch {
    return; // not configured — nothing to reconcile
  }

  const cutoff = new Date(Date.now() - RECONCILE_LOOKBACK_MS);
  const [pendingOrders, pendingTransactions] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'PENDING', providerChargeId: { not: null }, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
      take: RECONCILE_BATCH_SIZE,
    }),
    prisma.subscriptionTransaction.findMany({
      where: {
        status: 'PENDING',
        providerTransactionId: { not: null },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
      take: RECONCILE_BATCH_SIZE,
    }),
  ]);

  // Parallel, not sequential — each row's verify call is an independent
  // network round-trip; awaiting them one at a time let the total wall-clock
  // time creep toward the function's execution budget with only a handful
  // of PENDING rows (observed live: only the first 3 of 6 got reconciled
  // before the run stopped). Each reconcile*() already isolates its own
  // errors and DB write, so a slow/failed row can't block the rest.
  await Promise.allSettled([
    ...pendingOrders.map((order) => reconcileOrder(provider, order)),
    ...pendingTransactions.map((transaction) =>
      reconcileSubscriptionTransaction(provider, transaction),
    ),
  ]);
}

async function onSaspaySignatureInvalid(): Promise<void> {
  if (!redis) return;
  // 5+ invalid-signature requests in a 5min window is a plausible signing
  // attack on the endpoint — dedupe the resulting alert to once per hour.
  const count = await incrWithWindow(redis, 'webhook:sig-fail:saspay', 5 * 60);
  if (count >= 5) {
    const bucket1h = new Date().toISOString().slice(0, 13);
    await createAdminAlert(prisma, webhookSignatureInvalid('saspay', bucket1h));
  }
}

export const POST = createWebhookHandler({
  prisma,
  provider: saspayWebhookProvider,
  onSignatureInvalid: onSaspaySignatureInvalid,

  async onPaid(payload, tx) {
    const externalRef = String(payload.data?.id ?? '');

    const order = externalRef
      ? await tx.order.findFirst({ where: { providerChargeId: externalRef } })
      : null;
    if (order) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID', paidAt: new Date() },
      });

      if (order.userId) {
        await enqueueOutbox(tx, {
          kind: 'notification.payment_received',
          payload: {
            userId: order.userId,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
          },
        });
      }
      if (order.customerEmail) {
        await enqueueOutbox(tx, {
          kind: 'email.payment_confirmation',
          payload: {
            to: order.customerEmail,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
          },
        });
      }
      return {};
    }

    // Not an Order charge — check the other flow this endpoint serves:
    // a freelance paying Merrudit for their Pro plan.
    const transaction = externalRef
      ? await tx.subscriptionTransaction.findFirst({
          where: { providerTransactionId: externalRef },
        })
      : null;
    if (!transaction) {
      // No direct match — see file header. Re-verify our own PENDING rows
      // against SasPay after this tx commits, instead of trusting the
      // payload's transaction-level id.
      return { postCommit: reconcilePendingSaspayPayments };
    }

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
    const externalRef = String(payload.data?.id ?? '');

    const order = externalRef
      ? await tx.order.findFirst({ where: { providerChargeId: externalRef } })
      : null;
    if (order) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'FAILED' },
      });

      if (order.userId) {
        await enqueueOutbox(tx, {
          kind: 'notification.order_payment_failed',
          payload: { userId: order.userId, orderId: order.id },
        });
      }
      return {};
    }

    const transaction = externalRef
      ? await tx.subscriptionTransaction.findFirst({
          where: { providerTransactionId: externalRef },
        })
      : null;
    if (!transaction) {
      return { postCommit: reconcilePendingSaspayPayments };
    }

    await tx.subscriptionTransaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED' },
    });

    const subscription = await tx.subscription.findUnique({
      where: { id: transaction.subscriptionId },
      select: { userId: true },
    });
    if (subscription) {
      await enqueueOutbox(tx, {
        kind: 'notification.subscription_payment_failed',
        payload: {
          userId: subscription.userId,
          subscriptionTransactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
        },
      });
    }

    return {};
  },
});
