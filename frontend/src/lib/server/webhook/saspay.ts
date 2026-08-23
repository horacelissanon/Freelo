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
import { createSaspayProvider, type SaspayWebhookPayload } from '../payments/saspay';

export type { SaspayWebhookPayload };

let _provider: WebhookProvider<SaspayWebhookPayload> | null = null;

export function getSaspayWebhookProvider(): WebhookProvider<SaspayWebhookPayload> {
  if (_provider) return _provider;
  const apiKey = process.env.SASPAY_API_KEY ?? '';
  const webhookSecret = process.env.SASPAY_WEBHOOK_SECRET ?? '';
  if (!apiKey) {
    throw new Error('SasPay webhook provider not configured (SASPAY_API_KEY missing)');
  }
  if (!webhookSecret) {
    throw new Error('SasPay webhook provider not configured (SASPAY_WEBHOOK_SECRET missing)');
  }
  _provider = createSaspayProvider({
    SASPAY_API_KEY: apiKey,
    ...(process.env.SASPAY_API_URL ? { SASPAY_API_URL: process.env.SASPAY_API_URL } : {}),
    SASPAY_WEBHOOK_SECRET: webhookSecret,
  }).webhookProvider;
  return _provider;
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
  _provider = null;
}
