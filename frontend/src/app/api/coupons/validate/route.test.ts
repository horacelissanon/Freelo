// GET /api/coupons/validate tests. Mirrors admin/plans/route.test.ts's
// requireAuth-mock pattern — validateCoupon itself is unit-tested in
// billing/coupons.test.ts, so this route test only checks status-code
// mapping and the auth/CSRF-exempt (GET) wiring.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/server/billing/coupons', () => ({ validateCoupon: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { validateCoupon } from '@/lib/server/billing/coupons';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockValidateCoupon = vi.mocked(validateCoupon);

const authCtx = { user: { sub: 'user_1', email: 'user@test.local' } };

function makeGet(code: string | null): NextRequest {
  const url = code
    ? `http://test/api/coupons/validate?code=${encodeURIComponent(code)}`
    : 'http://test/api/coupons/validate';
  return new NextRequest(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authCtx as never);
});

describe('GET /api/coupons/validate', () => {
  it('returns the code, discountType and percentOff for a valid percent coupon', async () => {
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
    const res = await GET(makeGet('save10'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      code: 'SAVE10',
      discountType: 'PERCENT',
      percentOff: 10,
      amountOff: null,
      billingCycle: null,
    });
    expect(mockValidateCoupon).toHaveBeenCalledWith({}, 'save10', 'user_1');
  });

  it('returns amountOff for a valid fixed-amount coupon', async () => {
    mockValidateCoupon.mockResolvedValue({
      ok: true,
      coupon: {
        id: 'coupon_2',
        code: 'FLAT500',
        discountType: 'AMOUNT',
        percentOff: null,
        amountOff: 500,
        billingCycle: null,
      },
    });
    const res = await GET(makeGet('flat500'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      code: 'FLAT500',
      discountType: 'AMOUNT',
      percentOff: null,
      amountOff: 500,
      billingCycle: null,
    });
  });

  it('returns billingCycle for a cycle-scoped coupon', async () => {
    mockValidateCoupon.mockResolvedValue({
      ok: true,
      coupon: {
        id: 'coupon_3',
        code: 'MONTHONLY',
        discountType: 'PERCENT',
        percentOff: 20,
        amountOff: null,
        billingCycle: 'MONTHLY',
      },
    });
    const res = await GET(makeGet('monthonly'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ billingCycle: 'MONTHLY' });
  });

  it('400s when the code query param is missing', async () => {
    const res = await GET(makeGet(null));
    expect(res.status).toBe(400);
    expect(mockValidateCoupon).not.toHaveBeenCalled();
  });

  it.each([
    ['COUPON_NOT_FOUND', 404],
    ['COUPON_INACTIVE', 400],
    ['COUPON_EXPIRED', 400],
    ['COUPON_LIMIT_REACHED', 409],
    ['COUPON_WRONG_CYCLE', 409],
    ['COUPON_ALREADY_USED', 409],
  ] as const)('maps %s to status %i', async (code, status) => {
    mockValidateCoupon.mockResolvedValue({ ok: false, code });
    const res = await GET(makeGet('SAVE10'));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(code);
  });

  it('returns 401/403 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const res = await GET(makeGet('SAVE10'));
    expect(res.status).toBe(401);
    expect(mockValidateCoupon).not.toHaveBeenCalled();
  });
});
