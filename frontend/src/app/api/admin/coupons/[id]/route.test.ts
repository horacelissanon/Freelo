// PATCH /api/admin/coupons/[id] tests. Mirrors admin/plans/[plan]/route.test.ts's
// CSRF/rate-limit/requireSuperadmin/logAdminAction boilerplate — the only
// editable field is `active` (code/percentOff are immutable after creation).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

vi.mock('@/lib/server/middleware', () => ({
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

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const superadmin = seedSuperadmin({ id: 'superadmin-1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/coupons/coupon_1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const existingCoupon = {
  id: 'coupon_1',
  code: 'SAVE10',
  percentOff: 10,
  active: true,
  expiresAt: null,
  redemptionCount: 3,
  createdAt: new Date('2026-08-18T00:00:00.000Z'),
  updatedAt: new Date('2026-08-18T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.coupon.findUnique.mockResolvedValue(existingCoupon as never);
});

describe('PATCH /api/admin/coupons/[id]', () => {
  it('deactivates a coupon and logs coupon.update', async () => {
    prismaMock.coupon.update.mockResolvedValue({ ...existingCoupon, active: false } as never);

    const res = await PATCH(makePatch({ active: false }), makeCtx('coupon_1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coupon).toMatchObject({ id: 'coupon_1', active: false });

    expect(prismaMock.coupon.update).toHaveBeenCalledWith({
      where: { id: 'coupon_1' },
      data: { active: false },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        action: 'coupon.update',
        targetType: 'Coupon',
        targetId: 'coupon_1',
        metadata: { from: { active: true }, to: { active: false } },
      }),
    );
  });

  it('404s for an unknown coupon id', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue(null);
    const res = await PATCH(makePatch({ active: false }), makeCtx('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.coupon.update).not.toHaveBeenCalled();
  });

  it('400s when active is missing from the body', async () => {
    const res = await PATCH(makePatch({}), makeCtx('coupon_1'));
    expect(res.status).toBe(400);
    expect(prismaMock.coupon.update).not.toHaveBeenCalled();
  });

  it('403s for ADMIN (SUPERADMIN-only)', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ active: false }), makeCtx('coupon_1'));
    expect(res.status).toBe(403);
    expect(prismaMock.coupon.update).not.toHaveBeenCalled();
  });

  it('missing CSRF -> 403, no Prisma call', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_MISMATCH' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ active: false }), makeCtx('coupon_1'));
    expect(res.status).toBe(403);
    expect(prismaMock.coupon.update).not.toHaveBeenCalled();
  });

  it('rate limited -> 429', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await PATCH(makePatch({ active: false }), makeCtx('coupon_1'));
    expect(res.status).toBe(429);
    expect(prismaMock.coupon.update).not.toHaveBeenCalled();
  });
});
