/**
 * POST /api/webhooks/saspay — SasPay checkout payment webhook adapter.
 *
 * Thin shim over the battle-tested factory at `lib/server/webhook/handler.ts`
 * (PROTECTED — never modified). The factory does ALL the hard work: raw-body
 * read via arrayBuffer, HMAC verify, Serializable transaction, WebhookLog
 * upsert + dedup, dispatch, processedAt write-back. This file only wires:
 *   - the SasPay-specific WebhookProvider (signature verify + payload parser)
 *   - per-event handlers that update Order rows + emit outbox events
 *
 * SasPay has no documented refund webhook event for checkout/transactions
 * (only settlement.* for payouts, which this app doesn't call) — so there's
 * no onRefunded handler here, unlike the (dormant) Bictorys wiring.
 *
 * CLAUDE.md invariants honored here:
 *   - runtime = 'nodejs' is exported below (Buffer/crypto + Prisma — the
 *     runtime-enforcement test fails CI otherwise).
 *   - dynamic = 'force-dynamic' is exported below (prevents accidental POST
 *     caching by Next.js).
 *   - This file NEVER reads the request body. The factory itself reads the
 *     raw bytes for byte-identical HMAC verification — reading the body here
 *     would be a silent HMAC regression.
 *   - Side-effects use enqueueOutbox(tx, ...) INSIDE the same Serializable tx
 *     the factory opens — never via after-commit closures.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { saspayWebhookProvider } from '@/lib/server/webhook/saspay';
import { enqueueOutbox } from '@/lib/server/outbox';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { incrWithWindow } from '@/lib/server/admin-alerts/counters';
import { createAdminAlert } from '@/lib/server/admin-alerts';
import { webhookSignatureInvalid } from '@/lib/server/admin-alerts/templates';

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
    if (!externalRef) return {};

    const order = await tx.order.findFirst({
      where: { providerChargeId: externalRef },
    });
    if (!order) return {}; // unknown session — log + drop (no DB row to update)

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
  },

  async onFailed(payload, tx) {
    const externalRef = String(payload.data?.id ?? '');
    if (!externalRef) return {};

    const order = await tx.order.findFirst({
      where: { providerChargeId: externalRef },
    });
    if (!order) return {};

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
  },
});
