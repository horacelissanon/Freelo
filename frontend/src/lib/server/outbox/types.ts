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
  | NotificationSubscriptionRenewedEvent
  | NotificationRefundReceivedEvent
  | NotificationSubscriptionPaymentFailedEvent
  | NotificationOrderPaymentFailedEvent
  | AdminAlertLargeRefundEvent;

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

/**
 * Emitted by the Bictorys webhook's onRefunded handler — a refund is a
 * financially-significant event for the freelance, so it goes through the
 * outbox (fired inside the webhook's Serializable tx) rather than a
 * postCommit closure.
 */
export interface NotificationRefundReceivedEvent {
  kind: 'notification.refund_received';
  payload: {
    userId: string;
    orderId: string;
    amount: number;
    currency: string;
  };
}

/**
 * Emitted by the FedaPay webhook's onFailed handler — the freelance's Pro
 * subscription payment attempt failed.
 */
export interface NotificationSubscriptionPaymentFailedEvent {
  kind: 'notification.subscription_payment_failed';
  payload: {
    userId: string;
    subscriptionTransactionId: string;
    amount: number;
    currency: string;
  };
}

/**
 * Emitted by the Bictorys webhook's onFailed handler — an end-client's
 * payment attempt on this freelance's Order failed.
 */
export interface NotificationOrderPaymentFailedEvent {
  kind: 'notification.order_payment_failed';
  payload: {
    userId: string;
    orderId: string;
  };
}

/**
 * Emitted alongside NotificationRefundReceivedEvent by the Bictorys
 * webhook's onRefunded handler when the refunded amount meets or exceeds
 * ADMIN_ALERT_LARGE_REFUND_THRESHOLD — a platform-side signal, dispatched
 * via createAdminAlert (admin-alerts/index.ts) rather than createNotification.
 */
export interface AdminAlertLargeRefundEvent {
  kind: 'admin_alert.large_refund';
  payload: {
    orderId: string;
    amount: number;
    currency: string;
  };
}

export type OutboxEventKind = OutboxEvent['kind'];
