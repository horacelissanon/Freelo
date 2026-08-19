// ADMIN-11 — GET /api/admin/subscription-transactions tests.
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
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const admin = seedAdmin({ id: 'admin-1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function seedTxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? 'tx_1',
    amount: overrides.amount ?? 3500,
    currency: overrides.currency ?? 'XOF',
    billingCycle: overrides.billingCycle ?? 'MONTHLY',
    status: overrides.status ?? 'PAID',
    provider: overrides.provider ?? 'fedapay',
    periodStart: overrides.periodStart ?? new Date('2026-08-01T00:00:00.000Z'),
    periodEnd: overrides.periodEnd ?? new Date('2026-09-01T00:00:00.000Z'),
    createdAt: overrides.createdAt ?? new Date('2026-08-01T00:00:00.000Z'),
    subscription: overrides.subscription ?? {
      user: { email: 'freelancer@test.local', name: 'Freelancer' },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('/api/admin/subscription-transactions', () => {
  it('GET returns paginated rows joined with the paying user identity', async () => {
    prismaMock.subscriptionTransaction.findMany.mockResolvedValue([seedTxRow()] as never);

    const res = await GET(makeGet('http://test/api/admin/subscription-transactions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      amount: 3500,
      status: 'PAID',
      subscription: { user: { email: 'freelancer@test.local' } },
    });
  });

  it('GET filters by status', async () => {
    prismaMock.subscriptionTransaction.findMany.mockResolvedValue([seedTxRow()] as never);
    await GET(makeGet('http://test/api/admin/subscription-transactions?status=FAILED'));
    const args = prismaMock.subscriptionTransaction.findMany.mock.calls[0]?.[0];
    expect(args?.where?.status).toBe('FAILED');
  });

  it('GET applies pagination with limit and cursor', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => seedTxRow({ id: `tx-${i}` }));
    prismaMock.subscriptionTransaction.findMany.mockResolvedValue(rows as never);

    const res = await GET(makeGet('http://test/api/admin/subscription-transactions?limit=10'));
    const body = await res.json();
    expect(body.items).toHaveLength(10);
    expect(body.nextCursor).not.toBeNull();
  });

  it('GET returns 401/403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await GET(makeGet('http://test/api/admin/subscription-transactions'));
    expect(res.status).toBe(403);
    expect(prismaMock.subscriptionTransaction.findMany).not.toHaveBeenCalled();
  });

  it('GET short-circuits when admin rate limit is exceeded', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/subscription-transactions'));
    expect(res.status).toBe(429);
    expect(prismaMock.subscriptionTransaction.findMany).not.toHaveBeenCalled();
  });
});
