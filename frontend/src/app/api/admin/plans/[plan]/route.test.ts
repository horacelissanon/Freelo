// PATCH /api/admin/plans/[plan] tests. Mirrors
// admin/subscriptions/[id]/route.test.ts's CSRF/rate-limit/requireSuperadmin
// boilerplate. getPlanConfig (the "existing row" lookup) is mocked directly
// rather than simulated through prismaMock's planConfig.findUnique/upsert —
// its own upsert-on-read behavior isn't this route's concern.
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
vi.mock('@/lib/server/billing/plans', () => ({ getPlanConfig: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { getPlanConfig } from '@/lib/server/billing/plans';
import { PATCH } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const mockGetPlanConfig = vi.mocked(getPlanConfig);

const superadmin = seedSuperadmin({ id: 'superadmin-1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/plans/PRO', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCtx(plan: string) {
  return { params: Promise.resolve({ plan }) };
}

const existingPro = {
  plan: 'PRO',
  monthlyAmount: 3500,
  yearlyAmount: 35000,
  currency: 'XOF',
  maxClients: null,
  maxActiveProjects: null,
  features: ['Clients illimités'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockGetPlanConfig.mockResolvedValue(existingPro as never);
});

describe('PATCH /api/admin/plans/[plan]', () => {
  it('updates PRO pricing and logs plan.update with only the changed fields', async () => {
    prismaMock.planConfig.update.mockResolvedValue({
      ...existingPro,
      monthlyAmount: 4000,
      updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    } as never);

    const res = await PATCH(makePatch({ monthlyAmount: 4000 }), makeCtx('PRO'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toMatchObject({ plan: 'PRO', monthlyAmount: 4000 });

    expect(prismaMock.planConfig.update).toHaveBeenCalledWith({
      where: { plan: 'PRO' },
      data: { monthlyAmount: 4000 },
    });
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    const call = mockLogAdminAction.mock.calls[0]?.[1];
    expect(call).toMatchObject({
      action: 'plan.update',
      targetType: 'PlanConfig',
      targetId: 'PRO',
      metadata: { from: { monthlyAmount: 3500 }, to: { monthlyAmount: 4000 } },
    });
  });

  it('updates the FREE devis/facture caps', async () => {
    mockGetPlanConfig.mockResolvedValue({
      plan: 'FREE',
      monthlyAmount: null,
      yearlyAmount: null,
      currency: 'XOF',
      maxClients: 1,
      maxActiveProjects: 2,
      maxInvoices: 1,
      maxQuotes: 1,
      features: [],
    } as never);
    prismaMock.planConfig.update.mockResolvedValue({
      plan: 'FREE',
      maxInvoices: 2,
      maxQuotes: 3,
      updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    } as never);

    const res = await PATCH(makePatch({ maxInvoices: 2, maxQuotes: 3 }), makeCtx('FREE'));
    expect(res.status).toBe(200);
    expect(prismaMock.planConfig.update).toHaveBeenCalledWith({
      where: { plan: 'FREE' },
      data: { maxInvoices: 2, maxQuotes: 3 },
    });
  });

  it('400s for an invalid plan param', async () => {
    const res = await PATCH(makePatch({ monthlyAmount: 4000 }), makeCtx('ENTERPRISE'));
    expect(res.status).toBe(400);
    expect(prismaMock.planConfig.update).not.toHaveBeenCalled();
  });

  it('400s when the body has no recognized field', async () => {
    const res = await PATCH(makePatch({}), makeCtx('PRO'));
    expect(res.status).toBe(400);
    expect(prismaMock.planConfig.update).not.toHaveBeenCalled();
  });

  it('403s for ADMIN (SUPERADMIN-only)', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ monthlyAmount: 4000 }), makeCtx('PRO'));
    expect(res.status).toBe(403);
    expect(prismaMock.planConfig.update).not.toHaveBeenCalled();
  });

  it('missing CSRF -> 403, no Prisma call', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_MISMATCH' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ monthlyAmount: 4000 }), makeCtx('PRO'));
    expect(res.status).toBe(403);
    expect(prismaMock.planConfig.update).not.toHaveBeenCalled();
  });

  it('rate limited -> 429', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await PATCH(makePatch({ monthlyAmount: 4000 }), makeCtx('PRO'));
    expect(res.status).toBe(429);
    expect(prismaMock.planConfig.update).not.toHaveBeenCalled();
  });
});
