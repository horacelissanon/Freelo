/**
 * SasPay provider — hosted checkout charges (mobile money + card, UEMOA/CEMAC)
 * and webhook signature verification. Payouts are NOT implemented here: the
 * `Withdrawal` flow in this app is an internal ledger record only (no
 * provider payout API is actually called anywhere today — see
 * withdrawals/route.ts), so there's nothing to wire yet. Add a `payout()`
 * function here (mirroring bictorys.ts's) if/when that changes.
 *
 * API docs: https://docs.saspay.me — base URL https://api.saspay.me/api/v1.
 * Auth: `Authorization: Bearer sk_live_xxx` (or sk_test_xxx). The checkout
 * endpoint does NOT support Idempotency-Key (a retry creates a second,
 * harmless PENDING session) — our own Order-row idempotency layer in
 * api/orders/route.ts + api/track/[token]/pay/route.ts already prevents a
 * retry from ever reaching this adapter twice for the same logical charge.
 *
 * Country: SasPay requires an ISO-3166-1 alpha-2 `country` on every checkout
 * session and validates it against `currency` (e.g. XOF only matches UEMOA
 * countries, not CM which is XAF). This app doesn't store a client's country
 * as its own field — it's derived from the customer's phone dial code via
 * the same UEMOA country table `PhoneInput` already uses
 * (`@/lib/countries`), falling back to `SASPAY_DEFAULT_COUNTRY` (default SN)
 * when no phone is available or it doesn't match a known dial code.
 *
 * Webhook signature: headers `X-Webhook-Signature` (hex sha256 HMAC,
 * lowercase), `X-Webhook-Timestamp` (unix seconds). Signed string is
 * `${timestamp}.${rawBody}`. A 5-minute (300s) tolerance window guards
 * against replay — override via SASPAY_WEBHOOK_TOLERANCE_SECONDS.
 */
import crypto from 'node:crypto';
import { COUNTRIES } from '@/lib/countries';
import type { WebhookProvider, ParsedIds } from '../webhook/handler';
import type { PaymentProvider, ChargeInput, ChargeResult } from './provider';

// ───────────────────────────────────────────────────────────────────────
// Env shape
// ───────────────────────────────────────────────────────────────────────

export interface SaspayEnv {
  /** Secret API key — Authorization: Bearer sk_live_xxx / sk_test_xxx. */
  SASPAY_API_KEY: string;
  /** Base URL. Defaults to https://api.saspay.me/api/v1. */
  SASPAY_API_URL?: string;
  /** HMAC signing secret from the SasPay dashboard (Webhooks tab). Required
   * only for the webhook route — charge() works without it. */
  SASPAY_WEBHOOK_SECRET?: string;
  /** ISO-3166-1 alpha-2 fallback when the customer's phone dial code can't
   * be matched to a known UEMOA country. Default "SN". */
  SASPAY_DEFAULT_COUNTRY?: string;
}

const DEFAULT_API_URL = 'https://api.saspay.me/api/v1';
const HTTP_TIMEOUT_MS = 30_000;

// ───────────────────────────────────────────────────────────────────────
// Webhook payload (envelope: { event, data })
// ───────────────────────────────────────────────────────────────────────

export interface SaspayWebhookPayload {
  event: string;
  data: {
    id?: string;
    reference?: string;
    status?: string;
    amount?: string;
    fee?: string;
    charged?: string;
    [key: string]: unknown;
  };
}

// ───────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────

const COUNTRIES_BY_DIAL_LENGTH_DESC = [...COUNTRIES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length,
);

/** Derive an ISO2 country from an E.164-ish phone string via its dial code. */
function countryFromPhone(phone: string | undefined, fallback: string): string {
  if (!phone) return fallback;
  const digits = phone.replace(/[^\d]/g, '');
  const match = COUNTRIES_BY_DIAL_LENGTH_DESC.find((c) => digits.startsWith(c.dialCode));
  return match?.iso2 ?? fallback;
}

/** SasPay amounts are decimal strings ("5000.00"), our Order model stores
 * an integer smallest-unit (5000). XOF/XAF have zero decimal places, so
 * this is always a plain ".00" suffix — kept generic in case a future
 * currency needs real cents. */
function toDecimalString(amount: number): string {
  return amount.toFixed(2);
}

function classifyStatus(raw: string | undefined): 'PENDING' | 'PAID' | 'FAILED' {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'SUCCESS' || s === 'PAID' || s === 'COMPLETED') return 'PAID';
  if (s === 'FAILED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'ERROR') return 'FAILED';
  return 'PENDING';
}

function webhookToleranceSeconds(): number {
  const raw = process.env.SASPAY_WEBHOOK_TOLERANCE_SECONDS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 300; // 5 minutes — matches SasPay's documented example.
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ───────────────────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────────────────

export interface SaspayProviderHandle extends PaymentProvider {
  webhookProvider: WebhookProvider<SaspayWebhookPayload>;
  /**
   * Re-fetch a checkout session's authoritative status straight from SasPay.
   *
   * Verified 2026-08-24 against real transaction.success/transaction.failed
   * webhooks: `payload.data.id` / `payload.data.reference` identify the
   * underlying mobile-money TRANSACTION attempt, not the checkout SESSION we
   * created — they never match the `id` we stored as providerChargeId /
   * providerTransactionId at charge() time. SasPay's own docs for
   * `GET /payments/{id}/verify/` say to never trust a memorized status and
   * always re-verify; this does the equivalent for the session resource
   * (`GET /checkout-sessions/{id}/`), which the webhook route calls — for
   * each still-PENDING row it owns — once a paid/failed event arrives for
   * ANY session, since the payload can't tell us which one.
   */
  verifyCheckoutSession(sessionId: string): Promise<'PENDING' | 'PAID' | 'FAILED'>;
}

export function createSaspayProvider(env: SaspayEnv): SaspayProviderHandle {
  if (!env.SASPAY_API_KEY) throw new Error('createSaspayProvider: SASPAY_API_KEY is required');

  const baseUrl = (env.SASPAY_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
  const defaultCountry = env.SASPAY_DEFAULT_COUNTRY || 'SN';

  // ── charge ─────────────────────────────────────────────────────────
  async function charge(input: ChargeInput): Promise<ChargeResult> {
    if (!input.customer.email) {
      // SasPay requires customer_email on every checkout session — surface
      // a clear error rather than sending an empty/placeholder value that
      // would silently break receipt delivery on their side.
      throw new Error('SasPay charge requires a customer email — none provided');
    }

    const country = countryFromPhone(input.customer.phone, defaultCountry);
    const body: Record<string, unknown> = {
      amount: toDecimalString(input.amount),
      currency: input.currency,
      description:
        typeof input.metadata?.description === 'string'
          ? input.metadata.description
          : `Paiement ${input.externalRef}`,
      country,
      customer_email: input.customer.email,
      customer_name: input.customer.name ?? 'Client',
      return_url: input.successUrl,
      metadata: { externalRef: input.externalRef, ...(input.metadata ?? {}) },
    };
    if (input.customer.phone) body.customer_phone = input.customer.phone;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/checkout-sessions/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SASPAY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`SasPay network error: ${msg}`);
    }
    clearTimeout(timer);

    const raw = await res.text();
    let data: Record<string, unknown> | undefined;
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    } catch {
      throw new Error(`SasPay returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
    }

    if (!res.ok) {
      const message =
        (data?.message as string | undefined) ??
        (data?.code as string | undefined) ??
        `HTTP ${res.status}`;
      throw new Error(`SasPay checkout session failed: ${message}`);
    }

    // Successful responses are wrapped: { success, data: { id, checkout_url,
    // status, ... }, code }. Errors observed so far are flat (message/code
    // at top level) — hence the two different unwrap targets above/below.
    const session = (data?.data as Record<string, unknown> | undefined) ?? data;
    const providerChargeId = String((session?.id as string | undefined) ?? '');
    const paymentUrl = String((session?.checkout_url as string | undefined) ?? '');
    if (!providerChargeId || !paymentUrl) {
      throw new Error('SasPay returned no session id or checkout_url');
    }

    return {
      providerChargeId,
      paymentUrl,
      status: classifyStatus(session?.status as string | undefined),
    };
  }

  // ── checkout session verification (see SaspayProviderHandle doc) ────
  async function verifyCheckoutSession(sessionId: string): Promise<'PENDING' | 'PAID' | 'FAILED'> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/checkout-sessions/${sessionId}/`, {
        headers: { Authorization: `Bearer ${env.SASPAY_API_KEY}` },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`SasPay network error verifying checkout session: ${msg}`);
    }
    clearTimeout(timer);

    const raw = await res.text();
    let data: Record<string, unknown> | undefined;
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    } catch {
      throw new Error(
        `SasPay returned non-JSON verifying checkout session (HTTP ${res.status}): ${raw.slice(0, 200)}`,
      );
    }

    if (!res.ok) {
      const message =
        (data?.message as string | undefined) ??
        (data?.code as string | undefined) ??
        `HTTP ${res.status}`;
      throw new Error(`SasPay checkout session verification failed: ${message}`);
    }

    // Wrapped the same way as charge()'s POST response: { success, data: {
    // id, status, ... }, code } — confirmed live 2026-08-24 (the docs
    // example shows a flat body, but the real API always wraps it).
    const session = (data?.data as Record<string, unknown> | undefined) ?? data;
    return classifyStatus(session?.status as string | undefined);
  }

  // ── webhook provider ──────────────────────────────────────────────
  const webhookProvider: WebhookProvider<SaspayWebhookPayload> = {
    name: 'saspay',

    verifySignature(rawBody, headers) {
      if (!env.SASPAY_WEBHOOK_SECRET) {
        return { valid: false, reason: 'SASPAY_WEBHOOK_SECRET not configured' };
      }
      const sig = headers['x-webhook-signature'];
      const ts = headers['x-webhook-timestamp'];
      if (!sig || !ts) {
        return { valid: false, reason: 'missing X-Webhook-Signature/X-Webhook-Timestamp' };
      }
      const tsNum = Number(ts);
      if (!Number.isFinite(tsNum)) {
        return { valid: false, reason: 'x-webhook-timestamp not numeric' };
      }
      const driftSeconds = Math.abs(Date.now() / 1000 - tsNum);
      const tolerance = webhookToleranceSeconds();
      if (driftSeconds > tolerance) {
        return {
          valid: false,
          reason: `replay window exceeded (${driftSeconds}s > ${tolerance}s)`,
        };
      }
      const signed = Buffer.concat([Buffer.from(`${ts}.`), rawBody]);
      const expected = crypto
        .createHmac('sha256', env.SASPAY_WEBHOOK_SECRET)
        .update(signed)
        .digest('hex');
      if (timingSafeStringEqual(sig, expected)) return { valid: true };
      return { valid: false, reason: 'HMAC mismatch' };
    },

    parsePayload(rawBody) {
      return JSON.parse(rawBody.toString('utf8')) as SaspayWebhookPayload;
    },

    extractIds(payload): ParsedIds {
      const externalId = String(payload.data?.id ?? payload.data?.reference ?? '');
      const eventType = payload.event;
      let kind: ParsedIds['kind'] = 'other';
      if (eventType === 'transaction.success') kind = 'paid';
      else if (eventType === 'transaction.failed' || eventType === 'transaction.cancelled') {
        kind = 'failed';
      }
      return { externalId, eventType, kind };
    },
  };

  return {
    name: 'saspay',
    charge,
    webhookProvider,
    verifyCheckoutSession,
  };
}
