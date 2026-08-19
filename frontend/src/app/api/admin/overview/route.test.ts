// ADMIN-08 — Super Admin overview dashboard tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { seedAdmin, mockRedis, type MockRedisStub } from '@/test-utils/admin-fixtures';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

const redisHolder: { current: MockRedisStub | null } = { current: null };
vi.mock('@/lib/server/redis', () => ({
  get redis() {
    return redisHolder.current;
  },
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

function makeGet(url: string = 'http://test/api/admin/overview'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function wireHappyPathPrisma(): void {
  // Call order matches the route's sequential awaits.
  prismaMock.user.count.mockResolvedValueOnce(42).mockResolvedValueOnce(5); // totalUsers, newUsersThisMonth
  prismaMock.subscription.findMany.mockResolvedValue([
    { billingCycle: 'MONTHLY' },
    { billingCycle: 'YEARLY' },
  ] as never);
  prismaMock.session.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }] as never);
  vi.mocked(prismaMock.outboxEvent.groupBy).mockResolvedValue([
    { status: 'PENDING', _count: 3 },
    { status: 'DEAD', _count: 1 },
  ] as never);
  vi.mocked(prismaMock.emailJob.groupBy).mockResolvedValue([
    { status: 'PENDING', _count: 2 },
    { status: 'DEAD', _count: 0 },
  ] as never);
  prismaMock.subscriptionTransaction.findMany
    .mockResolvedValueOnce([{ amount: 3500, createdAt: new Date() }] as never) // revenueRows (PAID)
    .mockResolvedValueOnce([
      {
        id: 'tx-fail-1',
        amount: 3500,
        currency: 'XOF',
        provider: 'fedapay',
        createdAt: new Date(),
        subscription: { user: { email: 'freelancer@test.local', name: 'Freelancer' } },
      },
    ] as never); // recentFailedPayments (FAILED)
  prismaMock.user.findMany.mockResolvedValue([
    {
      id: 'u1',
      email: 'new@test.local',
      name: null,
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date(),
      subscription: { plan: 'PRO' },
    },
  ] as never);
  prismaMock.subscription.count.mockResolvedValueOnce(1).mockResolvedValueOnce(10); // churnedThisMonth, everProBeforeThisMonth
  prismaMock.supportTicket.findMany.mockResolvedValue([
    { priority: 'HIGH' },
    { priority: 'MEDIUM' },
    { priority: 'LOW' },
    { priority: 'LOW' },
  ] as never); // 4 open, 1 urgent (HIGH)
  prismaMock.planConfig.findUnique.mockResolvedValue({
    id: 'plan-pro',
    plan: 'PRO',
    monthlyAmount: 3500,
    yearlyAmount: 35000,
    currency: 'XOF',
    maxClients: null,
    maxActiveProjects: null,
    features: [],
    updatedAt: new Date(),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockEnforceAdminRateLimit.mockResolvedValue(null);
  redisHolder.current = null;
});

describe('/api/admin/overview', () => {
  it('GET returns the full stat shape with real aggregates', async () => {
    wireHappyPathPrisma();
    redisHolder.current = mockRedis({ 'auth:lockout:foo@example.com': 1 });

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.totalUsers).toBe(42);
    expect(body.newUsersThisMonth).toBe(5);
    expect(body.activeSubscribers).toBe(2);
    expect(body.planDistribution).toEqual({ free: 40, pro: 2 });
    // MONTHLY (3500) + YEARLY normalized to 35000/12 rounded (2917) = 6417
    expect(body.mrr).toBe(3500 + Math.round(35000 / 12));
    expect(body.mrrCurrency).toBe('XOF');
    expect(body.dau).toBe(2);
    expect(body.revenueTrend).toHaveLength(6);
    // churnRate = 1 / max(1, 10) * 100, rounded to 1 decimal = 10
    expect(body.churnRate).toBe(10);
    expect(body.systemHealth).toEqual({
      outboxPending: 3,
      outboxDead: 1,
      emailPending: 2,
      emailDead: 0,
      lockoutCount: 1,
    });
    expect(body.support).toEqual({ openTickets: 4, urgentOpenTickets: 1 });
    expect(body.recentUsers).toHaveLength(1);
    expect(body.recentUsers[0]).toMatchObject({ id: 'u1', email: 'new@test.local', plan: 'PRO' });
    expect(body.recentFailedPayments).toHaveLength(1);
    expect(body.recentFailedPayments[0]).toMatchObject({
      id: 'tx-fail-1',
      amount: 3500,
      user: { email: 'freelancer@test.local' },
    });
  });

  it('GET returns lockoutCount 0 (no crash) when redis is not configured', async () => {
    wireHappyPathPrisma();
    redisHolder.current = null;

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.systemHealth.lockoutCount).toBe(0);
  });

  it('GET returns 401/403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('GET short-circuits when admin rate limit is exceeded', async () => {
    mockEnforceAdminRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('GET response includes x-request-id header', async () => {
    wireHappyPathPrisma();
    const res = await GET(makeGet());
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});
