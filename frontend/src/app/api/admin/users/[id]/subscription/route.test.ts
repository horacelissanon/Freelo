// PATCH /api/admin/users/[id]/subscription tests.
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
  return new NextRequest('http://test/api/admin/users/user-1/subscription', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCtx() {
  return { params: Promise.resolve({ id: 'user-1' }) };
}

const freeSub = {
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
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' } as never);
});

describe('PATCH /api/admin/users/[id]/subscription', () => {
  it('grants Pro and logs user.grant_pro', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(freeSub as never);
    prismaMock.subscription.update.mockResolvedValue({
      ...freeSub,
      plan: 'PRO',
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
    } as never);

    const res = await PATCH(makePatch({ action: 'grant' }), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription).toMatchObject({ plan: 'PRO', isProActive: true });

    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: expect.objectContaining({ plan: 'PRO', status: 'ACTIVE', billingCycle: 'MONTHLY' }),
    });
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    const call = mockLogAdminAction.mock.calls[0]?.[1];
    expect(call).toMatchObject({
      action: 'user.grant_pro',
      targetType: 'User',
      targetId: 'user-1',
    });
  });

  it('revokes Pro and logs user.revoke_pro', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      ...freeSub,
      plan: 'PRO',
      status: 'ACTIVE',
    } as never);
    prismaMock.subscription.update.mockResolvedValue({
      ...freeSub,
      plan: 'FREE',
      status: 'CANCELED',
    } as never);

    const res = await PATCH(makePatch({ action: 'revoke' }), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription).toMatchObject({ plan: 'FREE', isProActive: false });

    const call = mockLogAdminAction.mock.calls[0]?.[1];
    expect(call).toMatchObject({ action: 'user.revoke_pro' });
  });

  it('includes the optional reason in the audit metadata', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(freeSub as never);
    prismaMock.subscription.update.mockResolvedValue({
      ...freeSub,
      plan: 'PRO',
      status: 'ACTIVE',
    } as never);

    await PATCH(makePatch({ action: 'grant', reason: 'Geste commercial VIP' }), makeCtx());
    const call = mockLogAdminAction.mock.calls[0]?.[1];
    expect(call?.metadata).toMatchObject({ reason: 'Geste commercial VIP' });
  });

  it('creates a subscription row on the fly when the user never had one', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.subscription.upsert.mockResolvedValue(freeSub as never);
    prismaMock.subscription.update.mockResolvedValue({
      ...freeSub,
      plan: 'PRO',
      status: 'ACTIVE',
    } as never);

    const res = await PATCH(makePatch({ action: 'grant' }), makeCtx());
    expect(res.status).toBe(200);
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1' },
      update: {},
    });
  });

  it('404s when the user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await PATCH(makePatch({ action: 'grant' }), makeCtx());
    expect(res.status).toBe(404);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('400s on an invalid action', async () => {
    const res = await PATCH(makePatch({ action: 'nope' }), makeCtx());
    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('403s for ADMIN (SUPERADMIN-only)', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await PATCH(makePatch({ action: 'grant' }), makeCtx());
    expect(res.status).toBe(403);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('missing CSRF -> 403, no Prisma call', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_MISMATCH' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ action: 'grant' }), makeCtx());
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
