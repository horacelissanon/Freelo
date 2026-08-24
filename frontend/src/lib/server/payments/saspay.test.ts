import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSaspayProvider } from './saspay';

const ENV = { SASPAY_API_KEY: 'sk_test_xxx', SASPAY_API_URL: 'https://api.saspay.test' };

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('createSaspayProvider().charge', () => {
  it('throws when customer email is missing', async () => {
    const provider = createSaspayProvider(ENV);
    await expect(
      provider.charge({
        amount: 5000,
        currency: 'XOF',
        customer: { name: 'Awa' },
        successUrl: 'https://app.test/success',
        failureUrl: 'https://app.test/failure',
        externalRef: 'order_1',
      }),
    ).rejects.toThrow(/email/i);
  });

  it('derives country SN from a +221 phone number and sends decimal amount string', async () => {
    mockFetchOnce(201, {
      id: 'sess_1',
      checkout_url: 'https://pay.saspay.me/checkout/abc',
      status: 'PENDING',
    });
    const provider = createSaspayProvider(ENV);
    await provider.charge({
      amount: 5000,
      currency: 'XOF',
      customer: { email: 'client@test.local', name: 'Awa', phone: '+221771234567' },
      successUrl: 'https://app.test/success',
      failureUrl: 'https://app.test/failure',
      externalRef: 'order_2',
    });

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe('https://api.saspay.test/checkout-sessions/');
    const init = call?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_xxx');
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody.country).toBe('SN');
    expect(sentBody.amount).toBe('5000.00');
    expect(sentBody.customer_email).toBe('client@test.local');
  });

  it('falls back to SASPAY_DEFAULT_COUNTRY when phone has no known dial code', async () => {
    mockFetchOnce(201, {
      id: 'sess_2',
      checkout_url: 'https://pay.saspay.me/checkout/xyz',
      status: 'PENDING',
    });
    const provider = createSaspayProvider({ ...ENV, SASPAY_DEFAULT_COUNTRY: 'CI' });
    await provider.charge({
      amount: 1000,
      currency: 'XOF',
      customer: { email: 'client@test.local', phone: '+999000000' },
      successUrl: 'https://app.test/success',
      failureUrl: 'https://app.test/failure',
      externalRef: 'order_3',
    });
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody.country).toBe('CI');
  });

  it('maps a successful 201 response to ChargeResult', async () => {
    mockFetchOnce(201, {
      id: 'sess_3',
      checkout_url: 'https://pay.saspay.me/checkout/def',
      status: 'PENDING',
    });
    const provider = createSaspayProvider(ENV);
    const result = await provider.charge({
      amount: 2500,
      currency: 'XOF',
      customer: { email: 'a@test.local' },
      successUrl: 'https://app.test/success',
      failureUrl: 'https://app.test/failure',
      externalRef: 'order_4',
    });
    expect(result).toEqual({
      providerChargeId: 'sess_3',
      paymentUrl: 'https://pay.saspay.me/checkout/def',
      status: 'PENDING',
    });
  });

  it('unwraps the real SasPay envelope ({ success, data: {...}, code }), not a flat body', async () => {
    // Verified 2026-08-24 against the live SasPay API — successful
    // checkout-session responses wrap the session under `data`, unlike
    // the flat shape the other fixtures in this file use for brevity.
    mockFetchOnce(201, {
      success: true,
      data: {
        id: 'sess_envelope_1',
        checkout_url: 'https://checkout.saspay.me/envelope-slug',
        status: 'PENDING',
      },
      code: 201,
    });
    const provider = createSaspayProvider(ENV);
    const result = await provider.charge({
      amount: 3500,
      currency: 'XOF',
      customer: { email: 'a@test.local' },
      successUrl: 'https://app.test/success',
      failureUrl: 'https://app.test/failure',
      externalRef: 'order_5',
    });
    expect(result).toEqual({
      providerChargeId: 'sess_envelope_1',
      paymentUrl: 'https://checkout.saspay.me/envelope-slug',
      status: 'PENDING',
    });
  });

  it('throws with the provider message on a non-2xx response', async () => {
    mockFetchOnce(422, {
      message: 'La devise XOF ne correspond pas au pays CM.',
      code: 'currency_country_mismatch',
    });
    const provider = createSaspayProvider(ENV);
    await expect(
      provider.charge({
        amount: 1000,
        currency: 'XOF',
        customer: { email: 'a@test.local' },
        successUrl: 'https://app.test/success',
        failureUrl: 'https://app.test/failure',
        externalRef: 'order_5',
      }),
    ).rejects.toThrow(/devise XOF/);
  });
});

describe('createSaspayProvider().verifyCheckoutSession', () => {
  it('re-fetches the session by id and unwraps the { success, data: {...}, code } envelope', async () => {
    // GET /checkout-sessions/{id}/ is wrapped the same way as the POST
    // response, despite the docs example showing a flat body — verified
    // live 2026-08-24 (this is exactly the bug the fallback-reconcile path
    // hit on first deploy: reading `.status` off the un-unwrapped body
    // always returned undefined, so every row stayed PENDING forever).
    mockFetchOnce(200, { success: true, data: { id: 'sess_1', status: 'SUCCESS' }, code: 200 });
    const provider = createSaspayProvider(ENV);
    const status = await provider.verifyCheckoutSession('sess_1');
    expect(status).toBe('PAID');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe('https://api.saspay.test/checkout-sessions/sess_1/');
    const init = call?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_xxx');
  });

  it('classifies FAILED and PENDING statuses', async () => {
    const provider = createSaspayProvider(ENV);

    mockFetchOnce(200, { success: true, data: { id: 'sess_2', status: 'FAILED' }, code: 200 });
    expect(await provider.verifyCheckoutSession('sess_2')).toBe('FAILED');

    mockFetchOnce(200, { success: true, data: { id: 'sess_3', status: 'PENDING' }, code: 200 });
    expect(await provider.verifyCheckoutSession('sess_3')).toBe('PENDING');
  });

  it('throws with the provider message on a non-2xx response', async () => {
    mockFetchOnce(404, { message: 'Not found' });
    const provider = createSaspayProvider(ENV);
    await expect(provider.verifyCheckoutSession('missing')).rejects.toThrow(/Not found/);
  });
});
