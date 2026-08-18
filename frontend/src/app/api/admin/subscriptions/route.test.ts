// ADMIN-09 — GET /api/admin/subscriptions tests. Mirrors the ADMIN-01
// users-list test pattern (prismaMock + requireAdmin/enforceAdminRateLimit
// mocks), adapted for the Subscription model + joined user identity.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { seedAdmin } from '@/test-utils/admin-fixtures';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockEnforceAdminRateLimit = vi.mocked(enforceAdminRateLimit);

const admin = seedAdmin({ id: 'admin-1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function seedSubscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? 'sub_1',
    userId: overrides.userId ?? 'user_1',
    plan: overrides.plan ?? 'PRO',
    status: overrides.status ?? 'ACTIVE',
    billingCycle: overrides.billingCycle ?? 'MONTHLY',
    currentPeriodEnd: overrides.currentPeriodEnd ?? new Date('2026-09-01T00:00:00.000Z'),
    cancelAtPeriodEnd: overrides.cancelAtPeriodEnd ?? false,
    createdAt: overrides.createdAt ?? new Date('2026-08-01T00:00:00.000Z'),
    user: overrides.user ?? { email: 'freelancer@test.local', name: 'Freelancer' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockEnforceAdminRateLimit.mockResolvedValue(null);
});

describe('/api/admin/subscriptions', () => {
  it('GET returns paginated Subscription rows joined with user identity', async () => {
    const rows = [seedSubscriptionRow({ id: 'sub-1' }), seedSubscriptionRow({ id: 'sub-2' })];
    prismaMock.subscription.findMany.mockResolvedValue(rows as never);

    const res = await GET(makeGet('http://test/api/admin/subscriptions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      id: 'sub-1',
      plan: 'PRO',
      status: 'ACTIVE',
      user: { email: 'freelancer@test.local' },
    });
    expect(body.nextCursor).toBeNull();
    const args = prismaMock.subscription.findMany.mock.calls[0]?.[0];
    expect(args?.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('GET filters by plan and status', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([seedSubscriptionRow()] as never);

    await GET(makeGet('http://test/api/admin/subscriptions?plan=PRO&status=ACTIVE'));
    const args = prismaMock.subscription.findMany.mock.calls[0]?.[0];
    expect(args?.where?.plan).toBe('PRO');
    expect(args?.where?.status).toBe('ACTIVE');
  });

  it('GET applies pagination with limit and cursor', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => seedSubscriptionRow({ id: `sub-${i}` }));
    prismaMock.subscription.findMany.mockResolvedValue(rows as never);

    const res = await GET(makeGet('http://test/api/admin/subscriptions?limit=10'));
    const body = await res.json();
    expect(body.items).toHaveLength(10);
    expect(body.nextCursor).not.toBeNull();
    const args = prismaMock.subscription.findMany.mock.calls[0]?.[0];
    expect(args?.take).toBe(11);
  });

  it('GET returns 401/403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await GET(makeGet('http://test/api/admin/subscriptions'));
    expect(res.status).toBe(403);
    expect(prismaMock.subscription.findMany).not.toHaveBeenCalled();
  });

  it('GET short-circuits when admin rate limit is exceeded', async () => {
    mockEnforceAdminRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/subscriptions'));
    expect(res.status).toBe(429);
    expect(prismaMock.subscription.findMany).not.toHaveBeenCalled();
  });

  it('GET response includes x-request-id header', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/admin/subscriptions'));
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});
