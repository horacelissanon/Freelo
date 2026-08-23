/**
 * Admin alert templates — one typed wrapper per operational/security signal.
 * Mirrors the pattern in `notifications/templates.ts`: build a deterministic
 * dedupeKey per logical event/time-bucket, pass to `createAdminAlert`.
 *
 * Every dedupeKey here embeds a time bucket (hour or day) rather than firing
 * once-forever, because these are ongoing conditions (a circuit stays open,
 * lockouts keep happening) that should re-notify periodically without
 * spamming on every single occurrence.
 */
import type { CreateAdminAlertInput } from './index';

export function circuitOpen(
  breakerName: string,
  bucket15min: string,
  retryAtIso: string,
): CreateAdminAlertInput {
  return {
    type: 'payments.circuit_open',
    severity: 'CRITICAL',
    title: `Circuit "${breakerName}" ouvert`,
    body: `Le disjoncteur de paiement "${breakerName}" est ouvert (5+ échecs récents). Prochaine tentative autorisée à ${retryAtIso}.`,
    data: { breakerName, retryAtIso },
    dedupeKey: `circuit-open:${breakerName}:${bucket15min}`,
  };
}

export function webhookSignatureInvalid(provider: string, bucket1h: string): CreateAdminAlertInput {
  return {
    type: 'security.webhook_signature_invalid',
    severity: 'CRITICAL',
    title: `Signatures webhook invalides — ${provider}`,
    body: `Plusieurs requêtes avec une signature invalide ont été reçues sur le webhook ${provider} dans la dernière fenêtre.`,
    data: { provider },
    dedupeKey: `webhook-sig-invalid:${provider}:${bucket1h}`,
  };
}

export function oauthRejectionSpike(count: number, bucket30min: string): CreateAdminAlertInput {
  return {
    type: 'security.oauth_rejection_spike',
    severity: 'WARNING',
    title: 'Pic de rejets OAuth Google',
    body: `${count} tentatives de connexion Google refusées (email non vérifié) dans la dernière fenêtre.`,
    data: { count },
    dedupeKey: `oauth-rejection-spike:${bucket30min}`,
  };
}

export function lockoutSpike(
  count: number,
  severity: 'WARNING' | 'CRITICAL',
  bucket1h: string,
): CreateAdminAlertInput {
  return {
    type: 'security.lockout_spike',
    severity,
    title: 'Pic de comptes verrouillés',
    body: `${count} compte(s) actuellement verrouillé(s) suite à des échecs de connexion répétés.`,
    data: { count },
    dedupeKey: `lockout-spike:${severity}:${bucket1h}`,
  };
}

export function sessionGeoAnomaly(
  userId: string,
  sessionId: string,
  previousCountry: string | null,
  newCountry: string | null,
): CreateAdminAlertInput {
  return {
    type: 'security.session_geo_anomaly',
    severity: 'WARNING',
    title: 'Connexion depuis un pays inhabituel',
    body: `Nouvelle session depuis ${newCountry ?? 'un pays inconnu'} alors que la précédente venait de ${previousCountry ?? 'un pays inconnu'}. Vérifier avant de conclure à une compromission (voyage/VPN possibles).`,
    data: { userId, sessionId, previousCountry, newCountry },
    dedupeKey: `session-geo-anomaly:${userId}:${sessionId}`,
  };
}

export function fxRatesStale(todayKey: string): CreateAdminAlertInput {
  return {
    type: 'ops.fx_rates_stale',
    severity: 'CRITICAL',
    title: 'Rafraîchissement des taux de change en échec répété',
    body: "Le rafraîchissement quotidien des taux XOF/EUR/USD a échoué au moins deux fois de suite — le cache va expirer et l'app va retomber sur le taux figé de 1999.",
    dedupeKey: `fx-rates-stale:${todayKey}`,
  };
}

export type CouponAttentionReason = 'EXPIRING' | 'EXPIRED_ACTIVE' | 'QUOTA_NEAR';

export function couponAttention(
  couponId: string,
  code: string,
  reason: CouponAttentionReason,
  todayKey?: string,
): CreateAdminAlertInput {
  const REASON_LABEL: Record<CouponAttentionReason, string> = {
    EXPIRING: 'expire dans moins de 48h',
    EXPIRED_ACTIVE: 'a expiré mais est toujours actif',
    QUOTA_NEAR: "approche de son quota d'utilisations",
  };
  const severity = reason === 'EXPIRED_ACTIVE' ? 'WARNING' : 'INFO';
  return {
    type: 'billing.coupon_attention',
    severity,
    title: `Coupon ${code} — ${REASON_LABEL[reason]}`,
    body: `Le coupon "${code}" ${REASON_LABEL[reason]}.`,
    data: { couponId, code, reason },
    // EXPIRED_ACTIVE is a standing anomaly (should have been deactivated) —
    // repeat once per day until fixed. The other reasons are one-shot.
    dedupeKey:
      reason === 'EXPIRED_ACTIVE' && todayKey
        ? `coupon-attention:${couponId}:${reason}:${todayKey}`
        : `coupon-attention:${couponId}:${reason}`,
  };
}

export function supportTicketStale(
  ticketId: string,
  subject: string,
  ageHours: number,
  todayKey: string,
): CreateAdminAlertInput {
  const severity = ageHours >= 24 ? 'CRITICAL' : 'WARNING';
  return {
    type: 'support.high_ticket_stale',
    severity,
    title: `Ticket urgent en attente depuis ${ageHours}h`,
    body: `"${subject}" est un ticket priorité haute toujours OPEN depuis ${ageHours}h.`,
    data: { ticketId, subject, ageHours },
    dedupeKey: `support-ticket-stale:${ticketId}:${todayKey}`,
  };
}

export function withdrawalPinAbuse(userId: string, bucket1h: string): CreateAdminAlertInput {
  return {
    type: 'security.withdrawal_pin_abuse',
    severity: 'CRITICAL',
    title: 'Tentatives de PIN de retrait répétées',
    body: `L'utilisateur ${userId} a échoué son PIN de retrait plusieurs fois dans la dernière fenêtre — possible tentative de contournement.`,
    data: { userId },
    dedupeKey: `withdrawal-pin-abuse:${userId}:${bucket1h}`,
  };
}

export function withdrawalGuardBurst(userId: string, bucket1h: string): CreateAdminAlertInput {
  return {
    type: 'security.withdrawal_guard_burst',
    severity: 'WARNING',
    title: 'Rafale de retraits refusés',
    body: `L'utilisateur ${userId} a essuyé plusieurs refus de retrait (plafond/limite/solde) dans la dernière fenêtre.`,
    data: { userId },
    dedupeKey: `withdrawal-guard-burst:${userId}:${bucket1h}`,
  };
}

export function largeRefund(
  orderId: string,
  amount: number,
  currency: string,
): CreateAdminAlertInput {
  return {
    type: 'payments.large_refund',
    severity: 'WARNING',
    title: 'Remboursement à fort montant',
    body: `Un remboursement de ${amount} ${currency} a été traité pour la commande ${orderId}.`,
    data: { orderId, amount, currency },
    dedupeKey: `large-refund:${orderId}`,
  };
}
