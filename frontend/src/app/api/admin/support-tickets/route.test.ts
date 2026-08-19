// ADMIN-10 — GET /api/admin/support-tickets tests.
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

function seedTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? 'ticket_1',
    userId: overrides.userId ?? 'user_1',
    subject: overrides.subject ?? 'Facture non envoyée',
    message: overrides.message ?? 'Détails...',
    priority: overrides.priority ?? 'HIGH',
    status: overrides.status ?? 'OPEN',
    createdAt: overrides.createdAt ?? new Date('2026-08-18T00:00:00.000Z'),
    user: overrides.user ?? { email: 'freelancer@test.local', name: 'Freelancer' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('/api/admin/support-tickets', () => {
  it('GET returns paginated tickets joined with the submitter identity', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([seedTicket()] as never);

    const res = await GET(makeGet('http://test/api/admin/support-tickets'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      subject: 'Facture non envoyée',
      priority: 'HIGH',
      status: 'OPEN',
      user: { email: 'freelancer@test.local' },
    });
  });

  it('GET filters by status and priority', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([seedTicket()] as never);
    await GET(makeGet('http://test/api/admin/support-tickets?status=OPEN&priority=HIGH'));
    const args = prismaMock.supportTicket.findMany.mock.calls[0]?.[0];
    expect(args?.where?.status).toBe('OPEN');
    expect(args?.where?.priority).toBe('HIGH');
  });

  it('GET returns 401/403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await GET(makeGet('http://test/api/admin/support-tickets'));
    expect(res.status).toBe(403);
    expect(prismaMock.supportTicket.findMany).not.toHaveBeenCalled();
  });

  it('GET short-circuits when admin rate limit is exceeded', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/support-tickets'));
    expect(res.status).toBe(429);
    expect(prismaMock.supportTicket.findMany).not.toHaveBeenCalled();
  });
});
