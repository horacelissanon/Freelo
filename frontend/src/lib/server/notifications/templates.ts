/**
 * Notification templates.
 *
 * Each project defines its own typed wrappers around `createNotification`.
 * The example below ships with the template — adapt it, replace it, or add
 * more (e.g. `firePaymentReceived`, `fireExportReady`). The pattern:
 *
 *   1. Build a `CreateNotificationInput` with a *deterministic* dedupeKey
 *      so the unique constraint enforces at-most-once delivery for that
 *      logical event (e.g. `payment-received:${orderId}` — never include
 *      a timestamp or random suffix).
 *   2. Pass the input + your PrismaClient to `createNotification`.
 *   3. Optionally enqueue an email via `EmailQueue.enqueue` — but ONLY
 *      after the notification row is created, so a duplicate event never
 *      sends a duplicate email.
 *
 * Keep these helpers free of side effects beyond the row insert; the
 * email enqueue belongs at the call site so each project can pick the
 * right channel (no email vs. transactional vs. marketing).
 */

import type { CreateNotificationInput } from './index';

export function welcomeNotification(userId: string, email: string): CreateNotificationInput {
  return {
    userId,
    type: 'WELCOME',
    title: 'Welcome!',
    body: `Glad to have you on board, ${email}.`,
    dedupeKey: `welcome:${userId}`,
  };
}

/**
 * Example: notification dispatched after a successful payment.
 * Called from the Bictorys webhook handler's `onPaid` post-commit hook.
 */
export function paymentReceived(
  userId: string,
  orderId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    body: `Order ${orderId} for ${amount} ${currency} confirmed.`,
    data: { orderId, amount, currency },
    dedupeKey: `payment-received:${orderId}`,
  };
}

/**
 * Dispatched after a FedaPay subscription renewal/upgrade transaction is
 * confirmed (Merrudit's own SaaS billing — see webhook/fedapay.ts).
 */
export function subscriptionRenewed(
  userId: string,
  subscriptionTransactionId: string,
  plan: string,
  currentPeriodEnd: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_RENEWED',
    title: 'Abonnement renouvelé',
    body: `Ton plan ${plan} est actif jusqu'au ${new Date(currentPeriodEnd).toLocaleDateString('fr-FR')}.`,
    data: { subscriptionTransactionId, plan, currentPeriodEnd },
    dedupeKey: `subscription-renewed:${subscriptionTransactionId}`,
  };
}

/**
 * Dispatched by the subscription-expiry cron a few days before a Pro
 * period ends. Deduped per (subscription, period) so the daily cron tick
 * doesn't re-fire it every day inside the reminder window.
 */
export function subscriptionExpiringSoon(
  userId: string,
  subscriptionId: string,
  currentPeriodEnd: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_EXPIRING_SOON',
    title: 'Ton abonnement Pro expire bientôt',
    body: `Renouvelle avant le ${new Date(currentPeriodEnd).toLocaleDateString('fr-FR')} pour garder tes fonctionnalités Pro.`,
    data: { subscriptionId, currentPeriodEnd },
    dedupeKey: `subscription-expiring:${subscriptionId}:${currentPeriodEnd}`,
  };
}
