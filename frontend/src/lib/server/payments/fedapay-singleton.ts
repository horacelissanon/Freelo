// Lazy-initialized FedaPay credentials + a dedicated CircuitBreaker instance
// — deliberately NOT shared with Bictorys's breaker (provider-singleton.ts):
// the two provide unrelated functions (client payments vs. SaaS
// subscription billing) and a Bictorys outage shouldn't trip subscription
// checkout, or vice versa. Mirrors provider-singleton.ts's pattern exactly.
import 'server-only';
import { fedapayCredentialsSchema, type FedapayCredentials } from '@/lib/server/payments/fedapay';
import { CircuitBreaker } from '@/lib/server/payments/circuit-breaker';

export class FedapayProviderUnconfiguredError extends Error {
  constructor() {
    super('FedaPay not configured (FEDAPAY_API_KEY missing or empty)');
    this.name = 'FedapayProviderUnconfiguredError';
  }
}

let _credentials: FedapayCredentials | null = null;

export function getFedapayCredentials(): FedapayCredentials {
  if (_credentials) return _credentials;
  const apiKey = process.env.FEDAPAY_API_KEY ?? '';
  const parsed = fedapayCredentialsSchema.safeParse({ apiKey });
  if (!parsed.success) throw new FedapayProviderUnconfiguredError();
  _credentials = parsed.data;
  return _credentials;
}

export const fedapayBreaker = new CircuitBreaker({
  name: 'fedapay.subscribe',
  failureThreshold: 5,
  windowMs: 30_000,
  cooldownMs: 60_000,
});

/** Test-only escape hatch — never call from application code. @internal */
export function __resetFedapayProviderSingleton(): void {
  _credentials = null;
}
