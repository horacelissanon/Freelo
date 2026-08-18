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

/**
 * Dispatched by the deadline-alerts cron for every INVOICE currently
 * OVERDUE and still unpaid — the first firing coincides with the SENT →
 * OVERDUE flip, then repeats once per calendar day (dedupeKey includes
 * `todayKey`) for as long as the invoice stays unpaid. Stops naturally the
 * day it's marked paid (query no longer matches status: 'OVERDUE').
 */
export function invoiceOverdue(
  userId: string,
  invoiceId: string,
  number: string,
  amount: number,
  currency: string,
  todayKey: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'invoice-overdue',
    title: `Facture ${number} en retard`,
    body: `${amount} ${currency} attendu — le client n'a pas encore payé.`,
    data: { invoiceId },
    dedupeKey: `invoice-overdue:${invoiceId}:${todayKey}`,
  };
}

/**
 * Dispatched by the deadline-alerts cron the moment a QUOTE crosses its
 * dueDate still unaccepted (status flips SENT → EXPIRED in the same sweep).
 * Mirrors invoiceOverdue above — deduped per quote, fires once.
 */
export function quoteExpired(
  userId: string,
  invoiceId: string,
  number: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'quote-expired',
    title: `Devis ${number} expiré`,
    body: `Le devis ${number} a dépassé sa date d'échéance sans être accepté.`,
    data: { invoiceId },
    dedupeKey: `quote-expired:${invoiceId}`,
  };
}

/**
 * Dispatched by the deadline-alerts cron for a PROJECT whose dueDate falls
 * within the reminder window and isn't DELIVERED yet. Deduped per
 * (project, todayKey) so it fires once per calendar day for as long as the
 * project stays inside the window — stops the day it's delivered (drops out
 * of the query) or its due date passes the window.
 */
export function projectDeadlineSoon(
  userId: string,
  projectId: string,
  name: string,
  dueDateIso: string,
  todayKey: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'project-deadline',
    title: `${name} — échéance proche`,
    body: `Livraison prévue le ${new Date(dueDateIso).toLocaleDateString('fr-FR')}.`,
    data: { projectId },
    dedupeKey: `project-deadline-soon:${projectId}:${todayKey}`,
  };
}

/**
 * Dispatched by the deadline-alerts cron for a PROJECT whose dueDate has
 * already passed without being DELIVERED — mirrors invoiceOverdue: no status
 * field to flip (Project has no OVERDUE state), just a daily-keyed reminder
 * that repeats for as long as the project stays undelivered past its date.
 */
export function projectOverdue(
  userId: string,
  projectId: string,
  name: string,
  dueDateIso: string,
  todayKey: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'project-overdue',
    title: `${name} — échéance dépassée`,
    body: `Livraison prévue le ${new Date(dueDateIso).toLocaleDateString('fr-FR')}, projet toujours non livré.`,
    data: { projectId },
    dedupeKey: `project-overdue:${projectId}:${todayKey}`,
  };
}

/**
 * Dispatched by the deadline-alerts cron for a QUOTE (devis) whose dueDate
 * falls within the reminder window and is still awaiting a client decision.
 * Mirrors projectDeadlineSoon — deduped per (quote, todayKey), repeats
 * daily until accepted or expired (either way it leaves status: 'SENT').
 */
export function quoteExpiringSoon(
  userId: string,
  invoiceId: string,
  number: string,
  dueDateIso: string,
  todayKey: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'quote-expiring-soon',
    title: `Devis ${number} — échéance proche`,
    body: `Le devis ${number} expire le ${new Date(dueDateIso).toLocaleDateString('fr-FR')} s'il n'est pas accepté.`,
    data: { invoiceId },
    dedupeKey: `quote-expiring-soon:${invoiceId}:${todayKey}`,
  };
}

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
 * period ends. Deduped per (subscription, todayKey) so it repeats once per
 * calendar day for as long as the subscription stays inside the reminder
 * window — stops the day it's renewed (currentPeriodEnd moves out of the
 * window) or it actually lapses (see subscriptionExpired below).
 */
export function subscriptionExpiringSoon(
  userId: string,
  subscriptionId: string,
  currentPeriodEnd: string,
  todayKey: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_EXPIRING_SOON',
    title: 'Ton abonnement Pro expire bientôt',
    body: `Renouvelle avant le ${new Date(currentPeriodEnd).toLocaleDateString('fr-FR')} pour garder tes fonctionnalités Pro.`,
    data: { subscriptionId, currentPeriodEnd },
    dedupeKey: `subscription-expiring:${subscriptionId}:${todayKey}`,
  };
}

/**
 * Dispatched by the subscription-expiry cron the moment a Pro subscription
 * lapses (currentPeriodEnd passed without renewal, flipped to plan: FREE /
 * status: EXPIRED) — i.e. the "payment overdue" terminal event. Fires once
 * per lapse; a later re-subscribe + a later new lapse would produce a
 * different currentPeriodEnd, so the dedupeKey still holds.
 */
export function subscriptionExpired(
  userId: string,
  subscriptionId: string,
  expiredPeriodEnd: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_EXPIRED',
    title: 'Ton abonnement Pro a expiré',
    body: "Le paiement n'a pas été reçu à temps — ton compte est repassé en plan Gratuit.",
    data: { subscriptionId, expiredPeriodEnd },
    dedupeKey: `subscription-expired:${subscriptionId}:${expiredPeriodEnd}`,
  };
}
