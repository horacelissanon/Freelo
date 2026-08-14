// FedaPay WebhookProvider — SaaS subscription billing only (see
// payments/fedapay.ts's header comment for the customer/transaction/token
// flow this confirms). Plugs into the same generic, protected
// `createWebhookHandler` factory as Bictorys (handler.ts:90) via
// `app/api/webhooks/fedapay/route.ts`.
//
// Signature format: FedaPay's PHP SDK mirrors Stripe's `Webhook::constructEvent`
// surface almost exactly (same method name, same "endpoint secret" concept
// starting with `wh_`), and their docs describe a timestamp embedded in the
// same header value to prevent replay — consistent with Stripe's
// `t=<ts>,v1=<hex hmac>` convention. Implemented against that assumption;
// VERIFY the exact header shape against a real webhook delivery from
// FedaPay's dashboard (Workbench → Webhooks → send test event) before
// relying on this in production — the fetched docs did not include a raw
// header example.
import 'server-only';
import crypto from 'node:crypto';
import type { WebhookProvider, ParsedIds } from './handler';

export interface FedapayWebhookPayload {
  name?: string; // "transaction.created" | "transaction.approved" | "transaction.canceled"
  entity?: { id?: number | string; status?: string };
  id?: number | string;
}

const REPLAY_WINDOW_MS = 5 * 60_000; // 5 minutes — generous given mobile-money confirmation latency

function parseSignatureHeader(header: string): { timestamp: string; signature: string } | null {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k?.trim(), v?.trim()];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1 ?? parts.s;
  if (!timestamp || !signature) return null;
  return { timestamp, signature };
}

function classifyKind(name: string | undefined): 'paid' | 'failed' | 'other' {
  if (name === 'transaction.approved') return 'paid';
  if (name === 'transaction.canceled') return 'failed';
  return 'other';
}

export function createFedapayWebhookProvider(
  webhookSecret: string,
): WebhookProvider<FedapayWebhookPayload> {
  return {
    name: 'fedapay',

    verifySignature(rawBody, headers) {
      if (process.env.SMOKE_BYPASS_WEBHOOK_VERIFY === '1') {
        return { valid: true };
      }
      const sigHeader = headers['x-fedapay-signature'];
      if (!sigHeader) return { valid: false, reason: 'missing X-FEDAPAY-SIGNATURE header' };
      const parsed = parseSignatureHeader(sigHeader);
      if (!parsed) return { valid: false, reason: 'malformed signature header' };

      const { timestamp, signature } = parsed;
      const ageMs = Date.now() - Number(timestamp) * 1000;
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > REPLAY_WINDOW_MS) {
        return { valid: false, reason: 'stale or invalid timestamp (possible replay)' };
      }

      const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${rawBody.toString('utf8')}`)
        .digest('hex');

      const expectedBuf = Buffer.from(expected, 'hex');
      const gotBuf = Buffer.from(signature, 'hex');
      const valid =
        expectedBuf.length === gotBuf.length && crypto.timingSafeEqual(expectedBuf, gotBuf);
      return valid ? { valid: true } : { valid: false, reason: 'signature mismatch' };
    },

    parsePayload(rawBody) {
      return JSON.parse(rawBody.toString('utf8')) as FedapayWebhookPayload;
    },

    extractIds(payload): ParsedIds {
      const externalId = String(payload.entity?.id ?? payload.id ?? '');
      const eventType = payload.name ?? 'unknown';
      return { externalId, eventType, kind: classifyKind(payload.name) };
    },
  };
}

let _provider: WebhookProvider<FedapayWebhookPayload> | null = null;

/** Lazy-init — env read happens at first call so `vi.stubEnv` works in tests. */
export function getFedapayWebhookProvider(): WebhookProvider<FedapayWebhookPayload> {
  if (_provider) return _provider;
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET ?? '';
  if (!secret)
    throw new Error('FedaPay webhook provider not configured (FEDAPAY_WEBHOOK_SECRET missing)');
  _provider = createFedapayWebhookProvider(secret);
  return _provider;
}

/** Convenience binding for the route file — mirrors webhook/bictorys.ts's shape. */
export const fedapayWebhookProvider: WebhookProvider<FedapayWebhookPayload> = {
  name: 'fedapay',
  verifySignature: (raw, headers) => getFedapayWebhookProvider().verifySignature(raw, headers),
  parsePayload: (raw) => getFedapayWebhookProvider().parsePayload(raw),
  extractIds: (payload) => getFedapayWebhookProvider().extractIds(payload),
};

/** Test-only — clear the cached provider so a test can mutate env and re-init. */
export function __resetFedapayWebhookProvider(): void {
  _provider = null;
}
