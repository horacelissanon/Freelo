// Phase A freelance CRM — /api/dashboard/stats GET.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/dashboard/stats', { method: 'GET' });
}

function stubDefaults() {
  prismaMock.invoice.aggregate.mockResolvedValue({ _sum: { amount: 0 } } as never);
  prismaMock.project.count.mockResolvedValue(0 as never);
  prismaMock.invoice.count.mockResolvedValue(0 as never);
  prismaMock.client.count.mockResolvedValue(0 as never);
  prismaMock.invoice.findMany.mockResolvedValue([] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  stubDefaults();
});

describe('GET /api/dashboard/stats', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('all-zero baseline -> zeroed shape, null revenue trend (no prior-month baseline)', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      revenue: { amount: 0, currency: 'XOF', trendPercent: null },
      activeProjects: { count: 0 },
      pendingInvoices: { amount: 0, currency: 'XOF', overdueCount: 0 },
      newClients: { count: 0, trend: 0 },
      revenueTrend: expect.any(Array),
    });
    expect(body.revenueTrend).toHaveLength(6);
    for (const bucket of body.revenueTrend) {
      expect(bucket).toEqual({ month: expect.stringMatching(/^\d{4}-\d{2}$/), amount: 0 });
    }
  });

  it('revenueTrend buckets PAID invoices by calendar month, oldest first', async () => {
    const now = new Date();
    const thisMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const twoMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 15));
    const twoMonthsAgoKey = `${twoMonthsAgo.getUTCFullYear()}-${String(twoMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}`;
    prismaMock.invoice.findMany.mockResolvedValue([
      { amount: 50000, issueDate: now },
      { amount: 30000, issueDate: now },
      { amount: 20000, issueDate: twoMonthsAgo },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.revenueTrend).toHaveLength(6);
    expect(body.revenueTrend[5]).toEqual({ month: thisMonthKey, amount: 80000 });
    const twoMonthsAgoBucket = body.revenueTrend.find(
      (b: { month: string }) => b.month === twoMonthsAgoKey,
    );
    expect(twoMonthsAgoBucket).toEqual({ month: twoMonthsAgoKey, amount: 20000 });
  });

  it('revenue trendPercent computed from this-month vs last-month PAID invoice sums', async () => {
    prismaMock.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 118000 } } as never) // this month
      .mockResolvedValueOnce({ _sum: { amount: 100000 } } as never) // last month
      .mockResolvedValueOnce({ _sum: { amount: 0 } } as never); // pending invoices agg
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.revenue.amount).toBe(118000);
    expect(body.revenue.trendPercent).toBe(18);
  });

  it('activeProjects reflects Project.count scoped by userId + not delivered', async () => {
    prismaMock.project.count.mockResolvedValue(4 as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.activeProjects).toEqual({ count: 4 });
    const arg = prismaMock.project.count.mock.calls[0]?.[0];
    expect(arg?.where?.userId).toBe('user-1');
    expect(arg?.where?.status).toEqual({ not: 'DELIVERED' });
  });

  it('pendingInvoices sums SENT+OVERDUE amount and counts OVERDUE separately', async () => {
    prismaMock.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } } as never) // this month revenue
      .mockResolvedValueOnce({ _sum: { amount: 0 } } as never) // last month revenue
      .mockResolvedValueOnce({ _sum: { amount: 185000 } } as never); // pending
    prismaMock.invoice.count.mockResolvedValue(2 as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.pendingInvoices).toEqual({ amount: 185000, currency: 'XOF', overdueCount: 2 });
    const aggArg = prismaMock.invoice.aggregate.mock.calls[2]?.[0];
    expect(aggArg?.where?.status).toEqual({ in: ['SENT', 'OVERDUE'] });
  });

  it('newClients.trend = this-month count - last-month count', async () => {
    prismaMock.client.count.mockResolvedValueOnce(5 as never).mockResolvedValueOnce(3 as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.newClients).toEqual({ count: 5, trend: 2 });
  });

  it('response includes x-request-id header', async () => {
    const res = await GET(makeGet());
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs' and withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
