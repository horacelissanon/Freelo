// ADMIN-09 (Wave 2) — PATCH /api/admin/subscriptions/[id] tests.
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
  return new NextRequest('http://test/api/admin/subscriptions/sub-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCtx() {
  return { params: Promise.resolve({ id: 'sub-1' }) };
}

const existingSub = {
  id: 'sub-1',
  userId: 'user-1',
  plan: 'FREE',
  status: 'ACTIVE',
  billingCycle: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('PATCH /api/admin/subscriptions/[id]', () => {
  it('overrides plan and logs subscription.override', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(existingSub as never);
    prismaMock.subscription.update.mockResolvedValue({
      ...existingSub,
      plan: 'PRO',
      status: 'ACTIVE',
    } as never);

    const res = await PATCH(makePatch({ plan: 'PRO' }), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription).toMatchObject({ id: 'sub-1', plan: 'PRO' });

    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { plan: 'PRO' },
    });
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    const call = mockLogAdminAction.mock.calls[0]?.[1];
    expect(call).toMatchObject({ action: 'subscription.override', targetType: 'Subscription' });
  });

  it('clears currentPeriodEnd when explicit null is sent', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      ...existingSub,
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    } as never);
    prismaMock.subscription.update.mockResolvedValue({
      ...existingSub,
      currentPeriodEnd: null,
    } as never);

    await PATCH(makePatch({ currentPeriodEnd: null }), makeCtx());
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { currentPeriodEnd: null },
    });
  });

  it('404s when the subscription does not exist', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const res = await PATCH(makePatch({ plan: 'PRO' }), makeCtx());
    expect(res.status).toBe(404);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('400s when the body has no recognized field', async () => {
    const res = await PATCH(makePatch({}), makeCtx());
    expect(res.status).toBe(400);
    expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('403s for ADMIN (SUPERADMIN-only)', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await PATCH(makePatch({ plan: 'PRO' }), makeCtx());
    expect(res.status).toBe(403);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('missing CSRF -> 403, no Prisma call', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_MISMATCH' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ plan: 'PRO' }), makeCtx());
    expect(res.status).toBe(403);
    expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled();
  });
});
