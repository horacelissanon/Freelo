// Lazy-initialized ACTIVE payment provider + module-level CircuitBreaker
// (D-PAY-02 + Pitfall 7). This is the slot orders/route.ts and
// track/[token]/pay/route.ts consume — swapping providers is one wiring
// change here, never at the call sites (they only see `PaymentProvider`).
//
// Currently wired to SasPay (checkout hosted payments, UEMOA/CEMAC mobile
// money + card). Bictorys' adapter (bictorys.ts) is kept in the codebase,
// unused/dormant, in case a fork wants to switch back — see CLAUDE.md
// "Payments are pluggable" for the general swap pattern.
//
// Why lazy?
//   `createSaspayProvider({...})` throws synchronously if SASPAY_API_KEY is
//   missing. Calling it at module top-level inside a route would crash the
//   route-module on import — every POST /api/orders would then return 500
//   with no useful error.
//
//   This module instead exposes `getProvider()` which constructs the provider
//   on first call, caches it for subsequent calls, and throws a typed
//   `PaymentProviderUnconfiguredError` if env is missing. The route catches
//   that error and returns a clean 503 PAYMENT_PROVIDER_UNCONFIGURED.
//
// Why a single shared CircuitBreaker?
//   The breaker holds in-memory failure-counter state. Re-instantiating it
//   per request would defeat its purpose. Sharing it at module scope is by
//   design — see CLAUDE.md "single-instance only" note for the in-memory
//   breaker. For multi-pod deployments swap for a Redis-backed variant.
import 'server-only';
import { createSaspayProvider, type SaspayProviderHandle } from '@/lib/server/payments/saspay';
import { CircuitBreaker } from '@/lib/server/payments/circuit-breaker';

/**
 * Thrown by `getProvider()` when SASPAY_API_KEY is missing/empty. The
 * orders route should catch this `instanceof` and return 503
 * PAYMENT_PROVIDER_UNCONFIGURED.
 */
export class PaymentProviderUnconfiguredError extends Error {
  constructor() {
    super('Payment provider not configured (SASPAY_API_KEY missing or empty)');
    this.name = 'PaymentProviderUnconfiguredError';
  }
}

let _provider: SaspayProviderHandle | null = null;

/**
 * Lazy-init singleton accessor. First call reads `process.env`, constructs
 * the SasPay provider, and caches the handle. Subsequent calls reuse the
 * cached instance. Throws `PaymentProviderUnconfiguredError` if
 * SASPAY_API_KEY is missing — the route translates that to 503.
 *
 * Note: SASPAY_WEBHOOK_SECRET is intentionally NOT required here — it only
 * gates the webhook route (api/webhooks/saspay), not charge creation, so a
 * fork can start accepting payments before wiring up webhook delivery.
 */
export function getProvider(): SaspayProviderHandle {
  if (_provider) return _provider;

  const apiKey = process.env.SASPAY_API_KEY ?? '';
  if (!apiKey) {
    throw new PaymentProviderUnconfiguredError();
  }

  _provider = createSaspayProvider({
    SASPAY_API_KEY: apiKey,
    ...(process.env.SASPAY_API_URL ? { SASPAY_API_URL: process.env.SASPAY_API_URL } : {}),
    ...(process.env.SASPAY_WEBHOOK_SECRET
      ? { SASPAY_WEBHOOK_SECRET: process.env.SASPAY_WEBHOOK_SECRET }
      : {}),
    ...(process.env.SASPAY_DEFAULT_COUNTRY
      ? { SASPAY_DEFAULT_COUNTRY: process.env.SASPAY_DEFAULT_COUNTRY }
      : {}),
  });
  return _provider;
}

/**
 * Module-level CircuitBreaker — single-instance only per CLAUDE.md.
 * D-PAY-02 hard-codes the thresholds:
 *   - failureThreshold = 5 failures within
 *   - windowMs = 30 000 (30s rolling window)
 *   - cooldownMs = 60 000 (open → half-open delay)
 */
export const breaker = new CircuitBreaker({
  name: 'saspay.charge',
  failureThreshold: 5,
  windowMs: 30_000,
  cooldownMs: 60_000,
});

/**
 * Test-only escape hatch — clears the cached provider so a test can mutate
 * `process.env.SASPAY_*` and re-trigger lazy init. Never call this from
 * application code.
 *
 * @internal
 */
export function __resetProviderSingleton(): void {
  _provider = null;
}
