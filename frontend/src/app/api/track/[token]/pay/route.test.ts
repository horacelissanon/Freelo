// Public guest-checkout payment on the Client Link Portal. The critical
// invariant under test: the charged amount is ALWAYS computed server-side
// from project.amount + project.depositType/depositValue — never trusted from the
// request body (there is no `amount` field in the body at all).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/payments/provider-singleton', () => ({
  getProvider: vi.fn(),
  breaker: { execute: vi.fn() },
  PaymentProviderUnconfiguredError: class PaymentProviderUnconfiguredError extends Error {
    constructor() {
      super('Payment provider not configured');
      this.name = 'PaymentProviderUnconfiguredError';
    }
  },
}));

import {
  getProvider,
  breaker,
  PaymentProviderUnconfiguredError,
} from '@/lib/server/payments/provider-singleton';
import { POST } from './route';

const mockGetProvider = vi.mocked(getProvider);
const mockExecute = vi.mocked(breaker.execute);

function ctxWith(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

function makePost(
  body: unknown,
  token: string,
  opts: { idempotencyKey?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.idempotencyKey !== null) {
    headers['idempotency-key'] = opts.idempotencyKey ?? 'idem-key-1';
  }
  return new NextRequest(`http://test/api/track/${token}/pay`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const projectFixture = {
  id: 'p-1',
  amount: 500000,
  currency: 'XOF',
  depositType: 'PERCENT',
  depositValue: 30,
  client: { name: 'Tekki Foods', email: 'contact@tekkifoods.sn', phone: null },
  user: {
    publicPortalEnabled: true,
    subscription: { plan: 'PRO', status: 'ACTIVE', currentPeriodEnd: null },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.order.findUnique.mockResolvedValue(null);
});

describe('POST /api/track/[token]/pay', () => {
  it('missing Idempotency-Key -> 400, no Prisma writes', async () => {
    const res = await POST(
      makePost({ kind: 'DEPOSIT' }, 'tok-1', { idempotencyKey: null }),
      ctxWith('tok-1'),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('invalid kind -> 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ kind: 'REFUND' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(400);
  });

  it('unknown token -> 404 NOT_FOUND', async () => {
    prismaMock.project.findUnique.mockResolvedValue(null);
    const res = await POST(
      makePost({ kind: 'DEPOSIT' }, 'does-not-exist'),
      ctxWith('does-not-exist'),
    );
    expect(res.status).toBe(404);
  });

  it('owner has publicPortalEnabled=false -> 404 NOT_FOUND, no order created', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      ...projectFixture,
      user: { publicPortalEnabled: false, subscription: null },
    } as never);

    const res = await POST(makePost({ kind: 'DEPOSIT' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(404);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('owner is on FREE plan -> 403 PLAN_REQUIRES_PRO, no order created', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      ...projectFixture,
      user: {
        publicPortalEnabled: true,
        subscription: { plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null },
      },
    } as never);

    const res = await POST(makePost({ kind: 'DEPOSIT' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('PLAN_REQUIRES_PRO');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('deposit already paid -> 409 ALREADY_PAID', async () => {
    prismaMock.project.findUnique.mockResolvedValue(projectFixture as never);
    prismaMock.order.findMany.mockResolvedValue([
      { amount: 150000, metadata: { projectId: 'p-1', docType: 'DEPOSIT' } },
    ] as never);

    const res = await POST(makePost({ kind: 'DEPOSIT' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_PAID');
  });

  it('balance charge adjusts to the real remaining amount when a partial acompte was already recorded', async () => {
    prismaMock.project.findUnique.mockResolvedValue(projectFixture as never);
    // Only 100 000 was actually recorded as the deposit, not the theoretical
    // 30% (150 000) — the balance charge must reflect the true 400 000 owed.
    prismaMock.order.findMany.mockResolvedValue([
      { amount: 100000, metadata: { projectId: 'p-1', docType: 'DEPOSIT' } },
    ] as never);
    prismaMock.order.create.mockResolvedValue({ id: 'order-2' } as never);
    prismaMock.order.update.mockResolvedValue({} as never);
    mockGetProvider.mockReturnValue({ name: 'bictorys', charge: vi.fn() } as never);
    mockExecute.mockResolvedValue({
      providerChargeId: 'charge-2',
      paymentUrl: 'https://pay.bictorys.com/checkout/abc',
      status: 'PENDING',
    });

    const res = await POST(makePost({ kind: 'BALANCE' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(201);
    const createArg = prismaMock.order.create.mock.calls[0]?.[0];
    expect(createArg?.data?.amount).toBe(400000);
  });

  it('balance requested before deposit is paid -> 409 DEPOSIT_REQUIRED', async () => {
    prismaMock.project.findUnique.mockResolvedValue(projectFixture as never);
    prismaMock.order.findMany.mockResolvedValue([] as never);

    const res = await POST(makePost({ kind: 'BALANCE' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('DEPOSIT_REQUIRED');
  });

  it('provider unconfigured -> 503 PAYMENT_PROVIDER_UNCONFIGURED', async () => {
    prismaMock.project.findUnique.mockResolvedValue(projectFixture as never);
    prismaMock.order.findMany.mockResolvedValue([] as never);
    mockGetProvider.mockImplementation(() => {
      throw new PaymentProviderUnconfiguredError();
    });

    const res = await POST(makePost({ kind: 'DEPOSIT' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('PAYMENT_PROVIDER_UNCONFIGURED');
  });

  it('happy path — charges the server-computed deposit amount, never a client-supplied one', async () => {
    prismaMock.project.findUnique.mockResolvedValue(projectFixture as never);
    prismaMock.order.findMany.mockResolvedValue([] as never);
    prismaMock.order.create.mockResolvedValue({ id: 'order-1' } as never);
    prismaMock.order.update.mockResolvedValue({} as never);
    mockGetProvider.mockReturnValue({
      name: 'bictorys',
      charge: vi.fn(),
    } as never);
    mockExecute.mockResolvedValue({
      providerChargeId: 'charge-1',
      paymentUrl: 'https://pay.bictorys.com/checkout/xyz',
      status: 'PENDING',
    });

    const res = await POST(makePost({ kind: 'DEPOSIT' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.paymentUrl).toBe('https://pay.bictorys.com/checkout/xyz');

    // 30% of 500 000 = 150 000 — computed server-side, not from the request body.
    const createArg = prismaMock.order.create.mock.calls[0]?.[0];
    expect(createArg?.data?.amount).toBe(150000);
    expect(createArg?.data?.userId).toBe(null);
  });

  it('replay with same Idempotency-Key -> 200 with the prior paymentUrl, no second charge', async () => {
    prismaMock.project.findUnique.mockResolvedValue(projectFixture as never);
    prismaMock.order.findMany.mockResolvedValue([] as never);
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING',
      paymentUrl: 'https://pay.bictorys.com/checkout/xyz',
      // No idempotencyBodyHash recorded — route treats that as "no stored
      // hash to compare against" and allows the replay through unchanged.
      metadata: { projectId: 'p-1', docType: 'DEPOSIT' },
    } as never);

    const res = await POST(
      makePost({ kind: 'DEPOSIT' }, 'tok-1', { idempotencyKey: 'replay-key' }),
      ctxWith('tok-1'),
    );
    expect(res.status).toBe(200);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
