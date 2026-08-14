/**
 * FedaPay adapter — SaaS subscription billing only (Merrudit's own Pro
 * plan), NOT the end-client-pays-freelancer flow (that stays on Bictorys via
 * the `PaymentProvider` interface in `provider.ts`). Deliberately NOT
 * implementing that interface: `ChargeInput`/`ChargeResult` are shaped for a
 * single one-off charge tied to an `Order` row, while subscription billing
 * needs a `customerId` (FedaPay requires pre-registering a Customer before
 * any Transaction — see docs.fedapay.com/payments/customer) and a
 * `billingCycle` concept that has no Order analogue.
 *
 * Flow (FedaPay v1 REST, confirmed shape from docs.fedapay.com during
 * research — customer-then-transaction-then-checkout-token is their
 * documented pattern; VERIFY the exact request/response field names against
 * a live sandbox key before taking real payments, the fetched docs did not
 * expose a full request/response example for the token step):
 *   1. POST /v1/customers            — register once, cache by email
 *   2. POST /v1/transactions         — create a PENDING transaction
 *   3. POST /v1/transactions/{id}/token — mint a checkout URL to redirect to
 *
 * Webhooks (`transaction.created` / `transaction.approved` /
 * `transaction.canceled`) are signed via the `X-FEDAPAY-SIGNATURE` header —
 * see `webhook/fedapay.ts` for verification + payload parsing.
 */
import 'server-only';
import { z } from 'zod';

const FEDAPAY_API_URL = process.env.FEDAPAY_API_URL || 'https://api.fedapay.com';
const FETCH_TIMEOUT_MS = 15_000;

export const fedapayCredentialsSchema = z.object({
  apiKey: z.string().trim().min(10),
});
export type FedapayCredentials = z.infer<typeof fedapayCredentialsSchema>;

export interface CreateTransactionParams {
  amount: number;
  currency: string;
  description: string;
  callbackUrl: string;
  customer: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
}

export type CreateTransactionResult =
  | { ok: true; transactionId: string; paymentUrl: string }
  | { ok: false; error: string };

function splitName(
  full: string | undefined,
  fallbackEmail: string,
): { first: string; last: string } {
  const v = (full ?? '').trim();
  if (!v) {
    const local = fallbackEmail.split('@')[0] || 'Client';
    return { first: local, last: '-' };
  }
  const parts = v.split(/\s+/);
  return { first: parts[0]!, last: parts.slice(1).join(' ') || '-' };
}

async function fedapayFetch(
  credentials: FedapayCredentials,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${FEDAPAY_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getOrCreateCustomer(
  credentials: FedapayCredentials,
  customer: CreateTransactionParams['customer'],
): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const { first, last } = splitName(
    customer.firstName || customer.lastName
      ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`
      : undefined,
    customer.email,
  );

  let res: Response;
  try {
    res = await fedapayFetch(credentials, '/v1/customers', {
      method: 'POST',
      body: JSON.stringify({
        firstname: customer.firstName || first,
        lastname: customer.lastName || last,
        email: customer.email,
        ...(customer.phone ? { phone_number: { number: customer.phone } } : {}),
      }),
    });
  } catch (err) {
    return { ok: false, error: `Network error contacting FedaPay: ${(err as Error).message}` };
  }

  let parsed: { customer?: { id?: number | string }; message?: string };
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    return { ok: false, error: `FedaPay returned ${res.status} (non-JSON) creating customer` };
  }
  if (!res.ok || parsed.customer?.id === undefined) {
    return {
      ok: false,
      error: parsed.message || `FedaPay responded ${res.status} creating customer`,
    };
  }
  return { ok: true, customerId: String(parsed.customer.id) };
}

export async function createTransaction(
  credentials: FedapayCredentials,
  params: CreateTransactionParams,
): Promise<CreateTransactionResult> {
  const customerResult = await getOrCreateCustomer(credentials, params.customer);
  if (!customerResult.ok) return customerResult;

  let txRes: Response;
  try {
    txRes = await fedapayFetch(credentials, '/v1/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: params.description.slice(0, 200),
        amount: params.amount,
        currency: { iso: params.currency },
        callback_url: params.callbackUrl,
        customer_id: customerResult.customerId,
      }),
    });
  } catch (err) {
    return { ok: false, error: `Network error contacting FedaPay: ${(err as Error).message}` };
  }

  let txParsed: { transaction?: { id?: number | string }; message?: string };
  try {
    txParsed = (await txRes.json()) as typeof txParsed;
  } catch {
    return { ok: false, error: `FedaPay returned ${txRes.status} (non-JSON) creating transaction` };
  }
  if (!txRes.ok || txParsed.transaction?.id === undefined) {
    return {
      ok: false,
      error: txParsed.message || `FedaPay responded ${txRes.status} creating transaction`,
    };
  }
  const transactionId = String(txParsed.transaction.id);

  let tokenRes: Response;
  try {
    tokenRes = await fedapayFetch(credentials, `/v1/transactions/${transactionId}/token`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } catch (err) {
    return { ok: false, error: `Network error contacting FedaPay: ${(err as Error).message}` };
  }

  let tokenParsed: { token?: { url?: string }; url?: string; message?: string };
  try {
    tokenParsed = (await tokenRes.json()) as typeof tokenParsed;
  } catch {
    return {
      ok: false,
      error: `FedaPay returned ${tokenRes.status} (non-JSON) generating checkout token`,
    };
  }
  const paymentUrl = tokenParsed.token?.url ?? tokenParsed.url;
  if (!tokenRes.ok || !paymentUrl) {
    return {
      ok: false,
      error:
        tokenParsed.message || `FedaPay responded ${tokenRes.status} generating checkout token`,
    };
  }

  return { ok: true, transactionId, paymentUrl };
}

/** Probe key validity without a real charge — mirrors moneroo.ts's probeKey. */
export async function probeFedapayKey(
  credentials: FedapayCredentials,
): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fedapayFetch(credentials, '/v1/customers?per_page=1', { method: 'GET' });
  } catch (err) {
    return { ok: false, error: `Network error: ${(err as Error).message}` };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'Invalid FedaPay API key' };
  }
  return { ok: true };
}
