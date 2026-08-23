// POST /api/billing/subscribe — coupon-path tests only. The pre-existing
// no-coupon behavior (idempotency, CircuitBreaker, FedaPay error mapping)
// predates this file and stays covered by manual/smoke testing (see
// CLAUDE.md); these tests focus on what changed: applying + re-validating
// a coupon server-side and never trusting the client-side preview.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/payments/fedapay-singleton', () => ({
  getFedapayCredentials: vi.fn(() => ({ apiKey: 'test_key' })),
  fedapayBreaker: { execute: vi.fn((fn: () => unknown) => fn()) },
  FedapayProviderUnconfiguredError: class extends Error {},
}));
vi.mock('@/lib/server/payments/fedapay', () => ({ createTransaction: vi.fn() }));
vi.mock('@/lib/server/billing/subscription', () => ({
  getOrCreateSubscription: vi.fn(),
  computeNextPeriodEnd: vi.fn(() => new Date('2026-09-18T00:00:00.000Z')),
}));
vi.mock('@/lib/server/billing/plans', () => ({ getPlanConfig: vi.fn() }));
vi.mock('@/lib/server/billing/coupons', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/billing/coupons')>(
    '@/lib/server/billing/coupons',
  );
  return { ...actual, validateCoupon: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { getFedapayCredentials } from '@/lib/server/payments/fedapay-singleton';
import { createTransaction } from '@/lib/server/payments/fedapay';
import { getOrCreateSubscription } from '@/lib/server/billing/subscription';
import { getPlanConfig } from '@/lib/server/billing/plans';
import { validateCoupon } from '@/lib/server/billing/coupons';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockGetFedapayCredentials = vi.mocked(getFedapayCredentials);
const mockCreateTransaction = vi.mocked(createTransaction);
const mockGetOrCreateSubscription = vi.mocked(getOrCreateSubscription);
const mockGetPlanConfig = vi.mocked(getPlanConfig);
const mockValidateCoupon = vi.mocked(validateCoupon);

const authCtx = { user: { sub: 'user_1', email: 'user@test.local' } };

function makePost(body: unknown, idemKey = 'idem-1'): NextRequest {
  return new NextRequest('http://test/api/billing/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idemKey },
    body: JSON.stringify(body),
  });
}

const proConfig = {
  plan: 'PRO' as const,
  monthlyAmount: 3500,
  yearlyAmount: 35000,
  currency: 'XOF',
  maxClients: null,
  maxActiveProjects: null,
  maxInvoices: null,
  maxQuotes: null,
  features: [],
  updatedAt: '2026-08-18T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue(authCtx as never);
  mockGetFedapayCredentials.mockReturnValue({ apiKey: 'test_key' });
  mockGetOrCreateSubscription.mockResolvedValue({
    id: 'sub_1',
    userId: 'user_1',
    plan: 'FREE',
    status: 'ACTIVE',
    billingCycle: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
  mockGetPlanConfig.mockResolvedValue(proConfig);
  prismaMock.user.findUnique.mockResolvedValue({
    email: 'user@test.local',
    name: 'Test User',
    phone: null,
  } as never);
  prismaMock.subscriptionTransaction.findUnique.mockResolvedValue(null);
  prismaMock.subscriptionTransaction.create.mockResolvedValue({ id: 'tx_1' } as never);
  prismaMock.subscriptionTransaction.update.mockResolvedValue({} as never);
  mockCreateTransaction.mockResolvedValue({
    ok: true,
    transactionId: 'fedapay_tx_1',
    paymentUrl: 'https://checkout.fedapay.test/pay/1',
  });
});

describe('POST /api/billing/subscribe — coupon handling', () => {
  it('charges full price when no coupon is provided', async () => {
    const res = await POST(makePost({ billingCycle: 'MONTHLY' }));
    expect(res.status).toBe(201);
    expect(mockValidateCoupon).not.toHaveBeenCalled();
    expect(prismaMock.subscriptionTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 3500, couponCode: null }),
    });
  });

  it('applies the discount and stores the coupon code when the coupon is valid', async () => {
    mockValidateCoupon.mockResolvedValue({
      ok: true,
      coupon: {
        id: 'coupon_1',
        code: 'SAVE10',
        discountType: 'PERCENT',
        percentOff: 10,
        amountOff: null,
        billingCycle: null,
      },
    });

    const res = await POST(makePost({ billingCycle: 'MONTHLY', couponCode: 'save10' }));
    expect(res.status).toBe(201);
    expect(mockValidateCoupon).toHaveBeenCalledWith(
      expect.anything(),
      'save10',
      'user_1',
      'MONTHLY',
    );
    expect(prismaMock.subscriptionTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 3150, couponCode: 'SAVE10' }),
    });
    expect(prismaMock.couponRedemption.create).toHaveBeenCalledWith({
      data: { couponId: 'coupon_1', userId: 'user_1' },
    });
    expect(prismaMock.coupon.update).toHaveBeenCalledWith({
      where: { id: 'coupon_1' },
      data: { redemptionCount: { increment: 1 } },
    });
  });

  it('does not reserve a redemption when FedaPay checkout creation fails', async () => {
    mockValidateCoupon.mockResolvedValue({
      ok: true,
      coupon: {
        id: 'coupon_1',
        code: 'SAVE10',
        discountType: 'PERCENT',
        percentOff: 10,
        amountOff: null,
        billingCycle: null,
      },
    });
    mockCreateTransaction.mockResolvedValue({ ok: false, error: 'upstream error' });

    const res = await POST(makePost({ billingCycle: 'MONTHLY', couponCode: 'save10' }));
    expect(res.status).toBe(502);
    expect(prismaMock.couponRedemption.create).not.toHaveBeenCalled();
  });

  it.each([
    ['COUPON_NOT_FOUND', 404],
    ['COUPON_INACTIVE', 400],
    ['COUPON_EXPIRED', 400],
    ['COUPON_LIMIT_REACHED', 409],
    ['COUPON_WRONG_CYCLE', 409],
    ['COUPON_ALREADY_USED', 409],
  ] as const)(
    'rejects with %s (status %i) without creating any transaction',
    async (code, status) => {
      mockValidateCoupon.mockResolvedValue({ ok: false, code });

      const res = await POST(makePost({ billingCycle: 'MONTHLY', couponCode: 'BAD' }));
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(code);
      expect(prismaMock.subscriptionTransaction.create).not.toHaveBeenCalled();
      expect(mockCreateTransaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a YEARLY-only coupon applied to a MONTHLY subscribe request', async () => {
    mockValidateCoupon.mockResolvedValue({ ok: false, code: 'COUPON_WRONG_CYCLE' });

    const res = await POST(makePost({ billingCycle: 'MONTHLY', couponCode: 'YEARONLY' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('COUPON_WRONG_CYCLE');
    expect(mockValidateCoupon).toHaveBeenCalledWith(
      expect.anything(),
      'YEARONLY',
      'user_1',
      'MONTHLY',
    );
  });
});
