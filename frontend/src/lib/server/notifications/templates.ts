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

/**
 * Dispatched from POST /api/withdrawals right after the withdrawal row
 * commits. Extracted from an inline object at the call site so every
 * notification type has a single typed source of truth.
 */
export function withdrawalRequested(
  userId: string,
  withdrawalId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'WITHDRAWAL_REQUESTED',
    title: 'Withdrawal requested',
    body: `Withdrawal of ${amount} ${currency} is pending.`,
    data: { withdrawalId, amount, currency },
    dedupeKey: `withdrawal-requested:${withdrawalId}`,
  };
}

/**
 * Dispatched by the Bictorys webhook's onRefunded handler (via outbox —
 * refunds happen inside the webhook's Serializable tx). Single-fire per
 * order: a refund is a terminal, one-time event for a given Order row.
 */
export function refundReceived(
  userId: string,
  orderId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'REFUND_RECEIVED',
    title: 'Remboursement effectué',
    body: `Un remboursement de ${amount} ${currency} a été traité pour ta commande ${orderId}.`,
    data: { orderId, amount, currency },
    dedupeKey: `refund-received:${orderId}`,
  };
}

/**
 * Dispatched by the FedaPay webhook's onFailed handler (via outbox) — the
 * freelance's Pro subscription payment attempt failed. Distinct from
 * subscriptionExpired: this fires immediately on a failed charge, ahead of
 * the J-3 reminder cron, so the user isn't only told once the plan has
 * already lapsed.
 */
export function subscriptionPaymentFailed(
  userId: string,
  subscriptionTransactionId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_PAYMENT_FAILED',
    title: 'Échec du paiement de ton abonnement',
    body: `Le paiement de ${amount} ${currency} pour ton abonnement Pro a échoué.`,
    data: { subscriptionTransactionId, amount, currency },
    dedupeKey: `subscription-payment-failed:${subscriptionTransactionId}`,
  };
}

/**
 * Dispatched by the Bictorys webhook's onFailed handler (via outbox) — an
 * end-client's payment attempt on this freelance's Order failed. In-app
 * only (no email) — clients frequently retry a failed charge themselves, so
 * this is informational rather than actionable.
 */
export function orderPaymentFailed(userId: string, orderId: string): CreateNotificationInput {
  return {
    userId,
    type: 'ORDER_PAYMENT_FAILED',
    title: 'Paiement client échoué',
    body: `Le paiement de la commande ${orderId} a échoué.`,
    data: { orderId },
    dedupeKey: `order-payment-failed:${orderId}`,
  };
}

/**
 * Dispatched by the order-expiration cron when a PENDING Order crosses its
 * expiresAt without being paid. In-app only — informational.
 */
export function orderExpired(userId: string, orderId: string): CreateNotificationInput {
  return {
    userId,
    type: 'ORDER_EXPIRED',
    title: 'Commande expirée',
    body: `La commande ${orderId} a expiré sans paiement.`,
    data: { orderId },
    dedupeKey: `order-expired:${orderId}`,
  };
}

/**
 * Dispatched when a SUPERADMIN manually cancels a PENDING/PROCESSING
 * withdrawal (POST /api/admin/withdrawals/[id]/cancel). The freelance was
 * expecting this money — this is a P1 event, not informational.
 */
export function withdrawalCancelled(
  userId: string,
  withdrawalId: string,
  amount: number,
  currency: string,
  reason: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'WITHDRAWAL_CANCELLED',
    title: 'Retrait annulé',
    body: `Ton retrait de ${amount} ${currency} a été annulé : ${reason}`,
    data: { withdrawalId, amount, currency, reason },
    dedupeKey: `withdrawal-cancelled:${withdrawalId}`,
  };
}

/**
 * Dispatched when an ADMIN marks a support ticket RESOLVED or IN_PROGRESS
 * (PATCH /api/admin/support-tickets/[id]). dedupeKey embeds the ticket's
 * `updatedAt` so a ticket that gets reopened and resolved again later
 * (a real, distinct event) isn't silently swallowed by the earlier
 * dedupeKey's unique constraint.
 */
export function supportTicketResolved(
  userId: string,
  ticketId: string,
  subject: string,
  updatedAtIso: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUPPORT_TICKET_RESOLVED',
    title: 'Ton ticket support a été résolu',
    body: `"${subject}" a été marqué comme résolu par notre équipe.`,
    data: { ticketId, subject },
    dedupeKey: `support-ticket-status:${ticketId}:RESOLVED:${updatedAtIso}`,
  };
}

export function supportTicketInProgress(
  userId: string,
  ticketId: string,
  subject: string,
  updatedAtIso: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUPPORT_TICKET_IN_PROGRESS',
    title: 'Ton ticket support est pris en charge',
    body: `"${subject}" est en cours de traitement par notre équipe.`,
    data: { ticketId, subject },
    dedupeKey: `support-ticket-status:${ticketId}:IN_PROGRESS:${updatedAtIso}`,
  };
}

/**
 * Dispatched when an ADMIN suspends/restores a User account
 * (PATCH /api/admin/users/[id]/status). Exempt from NotificationPreferences
 * (see notifications/index.ts + dispatch.ts) — an account-status change must
 * always reach the user on every channel. dedupeKey embeds `updatedAt` so a
 * later re-suspension (a real, distinct event) isn't swallowed.
 */
export function accountSuspended(userId: string, updatedAtIso: string): CreateNotificationInput {
  return {
    userId,
    type: 'ACCOUNT_SUSPENDED',
    title: 'Ton compte a été suspendu',
    body: 'Ton compte a été suspendu par un administrateur. Contacte le support si tu penses que c’est une erreur.',
    dedupeKey: `account-suspended:${userId}:${updatedAtIso}`,
  };
}

export function accountRestored(userId: string, updatedAtIso: string): CreateNotificationInput {
  return {
    userId,
    type: 'ACCOUNT_RESTORED',
    title: 'Ton compte a été réactivé',
    body: 'Ton compte est de nouveau actif — tu peux te reconnecter normalement.',
    dedupeKey: `account-restored:${userId}:${updatedAtIso}`,
  };
}

/**
 * Dispatched when a SUPERADMIN changes a User's role
 * (PATCH /api/admin/users/[id]/role). Exempt from NotificationPreferences —
 * same reasoning as accountSuspended.
 */
export function roleChanged(
  userId: string,
  newRole: string,
  updatedAtIso: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'ROLE_CHANGED',
    title: 'Ton rôle a changé',
    body: `Ton rôle est maintenant : ${newRole}.`,
    data: { newRole },
    dedupeKey: `role-changed:${userId}:${newRole}:${updatedAtIso}`,
  };
}

/**
 * Dispatched when a user fails their withdrawal PIN repeatedly in a short
 * window (see api/withdrawals/route.ts) — a security warning to the
 * account owner, paired with an AdminAlert (admin-alerts/templates.ts
 * ::withdrawalPinAbuse) for the platform side. Exempt from
 * NotificationPreferences — a security warning about the user's own
 * account must always reach them.
 */
export function withdrawalPinAbuseWarning(
  userId: string,
  hourBucket: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'WITHDRAWAL_PIN_ABUSE_WARNING',
    title: 'Plusieurs tentatives de PIN échouées',
    body: 'Plusieurs tentatives de retrait avec un PIN invalide ont été détectées sur ton compte. Si ce n’est pas toi, sécurise ton compte immédiatement.',
    dedupeKey: `withdrawal-pin-abuse:${userId}:${hourBucket}`,
  };
}

/**
 * Dispatched on POST /api/track/[token]/review — the client left (or
 * updated) a review on a delivered project. dedupeKey embeds the review
 * row's `updatedAt` (upsert) so a revised rating fires a fresh notification
 * rather than being swallowed by the first submission's dedupeKey.
 */
export function reviewReceived(
  userId: string,
  projectId: string,
  rating: number,
  updatedAtIso: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'REVIEW_RECEIVED',
    title: rating <= 2 ? 'Nouvel avis client — à consulter' : 'Nouvel avis client',
    body: `Un client a laissé un avis ${rating}/5 sur un de tes projets livrés.`,
    data: { projectId, rating },
    dedupeKey: `review-received:${projectId}:${updatedAtIso}`,
  };
}
