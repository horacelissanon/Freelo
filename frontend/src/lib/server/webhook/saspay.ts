// frontend/src/lib/server/webhook/saspay.ts
//
// Re-exports the WebhookProvider impl from the payments adapter so the
// webhook namespace is cohesive (handler factory + per-provider impls).
// The real HMAC code lives in payments/saspay.ts.
//
// Lazy-init env reads (mirrors webhook/bictorys.ts) so `vi.stubEnv` works in
// tests and the route module doesn't crash on import when env is missing.
import 'server-only';
import type { WebhookProvider } from './handler';
import {
  createSaspayProvider,
  type SaspayProviderHandle,
  type SaspayWebhookPayload,
} from '../payments/saspay';

export type { SaspayWebhookPayload };

let _handle: SaspayProviderHandle | null = null;

/** Full provider handle (webhook verify/parse + verifyCheckoutSession) —
 * use this when the route needs more than signature/payload handling, e.g.
 * the post-webhook reconciliation call. */
export function getSaspayProviderHandle(): SaspayProviderHandle {
  if (_handle) return _handle;
  const apiKey = process.env.SASPAY_API_KEY ?? '';
  const webhookSecret = process.env.SASPAY_WEBHOOK_SECRET ?? '';
  if (!apiKey) {
    throw new Error('SasPay webhook provider not configured (SASPAY_API_KEY missing)');
  }
  if (!webhookSecret) {
    throw new Error('SasPay webhook provider not configured (SASPAY_WEBHOOK_SECRET missing)');
  }
  _handle = createSaspayProvider({
    SASPAY_API_KEY: apiKey,
    ...(process.env.SASPAY_API_URL ? { SASPAY_API_URL: process.env.SASPAY_API_URL } : {}),
    SASPAY_WEBHOOK_SECRET: webhookSecret,
  });
  return _handle;
}

export function getSaspayWebhookProvider(): WebhookProvider<SaspayWebhookPayload> {
  return getSaspayProviderHandle().webhookProvider;
}

/** Convenience binding for the route file. */
export const saspayWebhookProvider: WebhookProvider<SaspayWebhookPayload> = {
  name: 'saspay',
  verifySignature: (raw, headers) => getSaspayWebhookProvider().verifySignature(raw, headers),
  parsePayload: (raw) => getSaspayWebhookProvider().parsePayload(raw),
  extractIds: (payload) => getSaspayWebhookProvider().extractIds(payload),
};

/** Test-only — clear the cached provider for `vi.stubEnv` reuse. */
export function __resetSaspayWebhookProvider(): void {
  _handle = null;
}
