// GET /api/admin/plans tests. Mirrors the ADMIN-01 listing test pattern
// (requireAdmin/enforceAdminRateLimit mocks), thin wrapper around
// getAllPlanConfigs so that's mocked directly rather than via prismaMock.
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
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/server/billing/plans', () => ({ getAllPlanConfigs: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getAllPlanConfigs } from '@/lib/server/billing/plans';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockEnforceAdminRateLimit = vi.mocked(enforceAdminRateLimit);
const mockGetAllPlanConfigs = vi.mocked(getAllPlanConfigs);

const admin = seedAdmin({ id: 'admin-1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/plans', { method: 'GET' });
}

const plans = {
  free: {
    plan: 'FREE',
    monthlyAmount: null,
    yearlyAmount: null,
    currency: 'XOF',
    maxClients: 1,
    maxActiveProjects: 2,
    features: ['1 client'],
    updatedAt: '2026-08-18T00:00:00Z',
  },
  pro: {
    plan: 'PRO',
    monthlyAmount: 3500,
    yearlyAmount: 35000,
    currency: 'XOF',
    maxClients: null,
    maxActiveProjects: null,
    features: ['Clients illimités'],
    updatedAt: '2026-08-18T00:00:00Z',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockEnforceAdminRateLimit.mockResolvedValue(null);
  mockGetAllPlanConfigs.mockResolvedValue(plans as never);
});

describe('GET /api/admin/plans', () => {
  it('returns both plan configs for an ADMIN', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(plans);
  });

  it('returns 401/403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(mockGetAllPlanConfigs).not.toHaveBeenCalled();
  });

  it('short-circuits when admin rate limit is exceeded', async () => {
    mockEnforceAdminRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
    expect(mockGetAllPlanConfigs).not.toHaveBeenCalled();
  });
});
