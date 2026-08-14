/**
 * Outbox event types. Add new variants here, then handle them in
 * backend/src/lib/outbox/dispatcher.ts.
 *
 * `kind` is a dotted "domain.event" string. The dispatcher looks up the
 * handler by exact match — no inheritance, no fallback dispatching.
 *
 * Each variant carries its own `payload` shape; runtime validation
 * happens in the dispatcher (the JSON column is opaque to Prisma).
 */

export type OutboxEvent =
  | NotificationPaymentReceivedEvent
  | EmailPaymentConfirmationEvent
  | EmailVerificationCodeEvent
  | EmailPasswordResetEvent
  | NotificationSubscriptionRenewedEvent;

export interface NotificationPaymentReceivedEvent {
  kind: 'notification.payment_received';
  payload: {
    userId: string;
    orderId: string;
    amount: number;
    currency: string;
  };
}

export interface EmailPaymentConfirmationEvent {
  kind: 'email.payment_confirmation';
  payload: {
    to: string;
    orderId: string;
    amount: number;
    currency: string;
  };
}

/**
 * Phase 1 — emitted by signup + resend-verification routes; consumed by the
 * email-queue cron in Phase 5 (which calls verificationEmail() to render).
 */
export interface EmailVerificationCodeEvent {
  kind: 'email.verification_code';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
  };
}

/**
 * Phase 1 — emitted by forgot-password route; consumed by the email-queue cron
 * in Phase 5 (which calls resetPasswordEmail() to render).
 */
export interface EmailPasswordResetEvent {
  kind: 'email.password_reset';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
  };
}

/**
 * Emitted by the FedaPay webhook's onPaid handler when a subscription
 * renewal/upgrade transaction is confirmed (see webhook/fedapay.ts wiring
 * in app/api/webhooks/fedapay/route.ts).
 */
export interface NotificationSubscriptionRenewedEvent {
  kind: 'notification.subscription_renewed';
  payload: {
    userId: string;
    subscriptionTransactionId: string;
    plan: string;
    currentPeriodEnd: string;
  };
}

export type OutboxEventKind = OutboxEvent['kind'];
