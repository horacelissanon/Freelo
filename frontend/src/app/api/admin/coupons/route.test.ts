// GET/POST /api/admin/coupons tests. GET mirrors the ADMIN-01 listing
// pattern (requireAdmin/enforceAdminRateLimit + cursor pagination, see
// support-tickets/route.test.ts); POST mirrors plans/[plan]/route.test.ts's
// CSRF/rate-limit/requireSuperadmin/logAdminAction boilerplate.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { seedAdmin, seedSuperadmin } from '@/test-utils/admin-fixtures';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { GET, POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const admin = seedAdmin({ id: 'admin-1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};
const superadmin = seedSuperadmin({ id: 'superadmin-1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/coupons${qs}`, { method: 'GET' });
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/coupons', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const couponRow = {
  id: 'coupon_1',
  code: 'SAVE10',
  discountType: 'PERCENT',
  percentOff: 10,
  amountOff: null,
  billingCycle: null,
  maxRedemptions: null,
  active: true,
  expiresAt: null,
  redemptionCount: 0,
  createdAt: new Date('2026-08-18T00:00:00.000Z'),
  updatedAt: new Date('2026-08-18T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('GET /api/admin/coupons', () => {
  it('returns the coupon list for an ADMIN', async () => {
    prismaMock.coupon.findMany.mockResolvedValue([couponRow] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([
      {
        ...couponRow,
        createdAt: couponRow.createdAt.toISOString(),
        updatedAt: couponRow.updatedAt.toISOString(),
      },
    ]);
  });

  it('returns 401/403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.coupon.findMany).not.toHaveBeenCalled();
  });

  it('rate limited -> 429', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
    expect(prismaMock.coupon.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/coupons', () => {
  it('creates a percent coupon (default discountType), uppercasing the code, and logs coupon.create', async () => {
    prismaMock.coupon.create.mockResolvedValue(couponRow as never);
    const res = await POST(makePost({ code: 'save10', percentOff: 10 }));
    expect(res.status).toBe(201);
    expect(prismaMock.coupon.create).toHaveBeenCalledWith({
      data: {
        code: 'SAVE10',
        discountType: 'PERCENT',
        percentOff: 10,
        amountOff: null,
        billingCycle: null,
        maxRedemptions: null,
        expiresAt: null,
      },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        actorId: superadmin.id,
        action: 'coupon.create',
        targetType: 'Coupon',
        targetId: 'coupon_1',
      }),
    );
  });

  it('creates a fixed-amount coupon with a max redemptions cap', async () => {
    prismaMock.coupon.create.mockResolvedValue({
      ...couponRow,
      discountType: 'AMOUNT',
      percentOff: null,
      amountOff: 500,
      maxRedemptions: 100,
    } as never);
    const res = await POST(
      makePost({ code: 'flat500', discountType: 'AMOUNT', amountOff: 500, maxRedemptions: 100 }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.coupon.create).toHaveBeenCalledWith({
      data: {
        code: 'FLAT500',
        discountType: 'AMOUNT',
        percentOff: null,
        amountOff: 500,
        billingCycle: null,
        maxRedemptions: 100,
        expiresAt: null,
      },
    });
  });

  it('creates a coupon scoped to MONTHLY only', async () => {
    prismaMock.coupon.create.mockResolvedValue({
      ...couponRow,
      billingCycle: 'MONTHLY',
    } as never);
    const res = await POST(
      makePost({ code: 'monthonly', percentOff: 10, billingCycle: 'MONTHLY' }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.coupon.create).toHaveBeenCalledWith({
      data: {
        code: 'MONTHONLY',
        discountType: 'PERCENT',
        percentOff: 10,
        amountOff: null,
        billingCycle: 'MONTHLY',
        maxRedemptions: null,
        expiresAt: null,
      },
    });
  });

  it('400s for an out-of-range percentOff', async () => {
    const res = await POST(makePost({ code: 'SAVE10', percentOff: 100 }));
    expect(res.status).toBe(400);
    expect(prismaMock.coupon.create).not.toHaveBeenCalled();
  });

  it('400s when discountType is AMOUNT but amountOff is missing', async () => {
    const res = await POST(makePost({ code: 'SAVE10', discountType: 'AMOUNT' }));
    expect(res.status).toBe(400);
    expect(prismaMock.coupon.create).not.toHaveBeenCalled();
  });

  it('409s when the code already exists (P2002)', async () => {
    prismaMock.coupon.create.mockRejectedValue({ code: 'P2002' });
    const res = await POST(makePost({ code: 'SAVE10', percentOff: 10 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('COUPON_CODE_TAKEN');
  });

  it('403s for ADMIN (SUPERADMIN-only)', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost({ code: 'SAVE10', percentOff: 10 }));
    expect(res.status).toBe(403);
    expect(prismaMock.coupon.create).not.toHaveBeenCalled();
  });

  it('missing CSRF -> 403, no Prisma call', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_MISMATCH' }, { status: 403 }),
    );
    const res = await POST(makePost({ code: 'SAVE10', percentOff: 10 }));
    expect(res.status).toBe(403);
    expect(prismaMock.coupon.create).not.toHaveBeenCalled();
  });
});
