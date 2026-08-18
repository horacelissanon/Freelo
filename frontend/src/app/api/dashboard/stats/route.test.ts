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

const getCachedRates = vi.fn();
vi.mock('@/lib/server/fx/rates', () => ({ getCachedRates }));

import { requireAuth } from '@/lib/server/middleware';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/dashboard/stats', { method: 'GET' });
}

// Dynamic import (not a static top-level one) — './route' transitively pulls
// in the mocked '@/lib/server/fx/rates', whose factory closes over the
// module-scoped `getCachedRates` const below. A static import gets evaluated
// before that const initializes (TDZ), so the module must load lazily here,
// same pattern as fx-rates/route.test.ts and cron/fx-rates-refresh/route.test.ts.
async function callGet(req: NextRequest) {
  const { GET } = await import('./route');
  return GET(req);
}

function stubDefaults() {
  prismaMock.user.findUnique.mockResolvedValue({ defaultCurrency: 'XOF' } as never);
  getCachedRates.mockResolvedValue({
    XOF: 655.957,
    EUR: 1,
    USD: 1.16,
    fetchedAt: '2026-08-18T00:00:00Z',
  });
  prismaMock.invoice.findMany.mockResolvedValue([] as never);
  prismaMock.project.count.mockResolvedValue(0 as never);
  prismaMock.invoice.count.mockResolvedValue(0 as never);
  prismaMock.client.count.mockResolvedValue(0 as never);
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
    const res = await callGet(makeGet());
    expect(res.status).toBe(401);
  });

  it('all-zero baseline -> zeroed shape, null revenue trend (no prior-month baseline)', async () => {
    const res = await callGet(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      revenue: { amount: 0, currency: 'XOF', amountsByCurrency: {}, trendPercent: null },
      activeProjects: { count: 0 },
      pendingInvoices: { amount: 0, currency: 'XOF', amountsByCurrency: {}, overdueCount: 0 },
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
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([] as never) // this month revenue
      .mockResolvedValueOnce([] as never) // last month revenue
      .mockResolvedValueOnce([] as never) // pending invoices
      .mockResolvedValueOnce([
        { amount: 50000, currency: 'XOF', exchangeRateToDefault: null, issueDate: now },
        { amount: 30000, currency: 'XOF', exchangeRateToDefault: null, issueDate: now },
        { amount: 20000, currency: 'XOF', exchangeRateToDefault: null, issueDate: twoMonthsAgo },
      ] as never); // revenue trend rows
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.revenueTrend).toHaveLength(6);
    expect(body.revenueTrend[5]).toEqual({ month: thisMonthKey, amount: 80000 });
    const twoMonthsAgoBucket = body.revenueTrend.find(
      (b: { month: string }) => b.month === twoMonthsAgoKey,
    );
    expect(twoMonthsAgoBucket).toEqual({ month: twoMonthsAgoKey, amount: 20000 });
  });

  it('revenue trendPercent computed from this-month vs last-month PAID invoice sums', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([
        { amount: 118000, currency: 'XOF', exchangeRateToDefault: null },
      ] as never) // this month
      .mockResolvedValueOnce([
        { amount: 100000, currency: 'XOF', exchangeRateToDefault: null },
      ] as never) // last month
      .mockResolvedValueOnce([] as never) // pending invoices
      .mockResolvedValueOnce([] as never); // trend
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.revenue.amount).toBe(118000);
    expect(body.revenue.trendPercent).toBe(18);
  });

  it('activeProjects reflects Project.count scoped by userId + not delivered', async () => {
    prismaMock.project.count.mockResolvedValue(4 as never);
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.activeProjects).toEqual({ count: 4 });
    const arg = prismaMock.project.count.mock.calls[0]?.[0];
    expect(arg?.where?.userId).toBe('user-1');
    expect(arg?.where?.status).toEqual({ notIn: ['DELIVERED', 'DRAFT'] });
  });

  it('pendingInvoices sums SENT+OVERDUE amount and counts OVERDUE separately', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([] as never) // this month revenue
      .mockResolvedValueOnce([] as never) // last month revenue
      .mockResolvedValueOnce([
        { amount: 185000, currency: 'XOF', exchangeRateToDefault: null },
      ] as never) // pending
      .mockResolvedValueOnce([] as never); // trend
    prismaMock.invoice.count.mockResolvedValue(2 as never);
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.pendingInvoices).toEqual({
      amount: 185000,
      currency: 'XOF',
      amountsByCurrency: { XOF: 185000 },
      overdueCount: 2,
    });
    const findManyArg = prismaMock.invoice.findMany.mock.calls[2]?.[0];
    expect(findManyArg?.where?.status).toEqual({ in: ['SENT', 'OVERDUE'] });
    // Regression: a devis (QUOTE) can also be SENT — must never inflate this
    // figure, which is meant to represent real money owed on factures only.
    expect(findManyArg?.where?.docType).toBe('INVOICE');
    const countArg = prismaMock.invoice.count.mock.calls[0]?.[0];
    expect(countArg?.where?.docType).toBe('INVOICE');
  });

  it('newClients.trend = this-month count - last-month count', async () => {
    prismaMock.client.count.mockResolvedValueOnce(5 as never).mockResolvedValueOnce(3 as never);
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.newClients).toEqual({ count: 5, trend: 2 });
  });

  it('converts a non-default-currency row using its frozen rate, and reports the raw breakdown', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([
        { amount: 1000, currency: 'XOF', exchangeRateToDefault: null },
        { amount: 100, currency: 'EUR', exchangeRateToDefault: 655.957 },
      ] as never) // this month
      .mockResolvedValueOnce([] as never) // last month
      .mockResolvedValueOnce([] as never) // pending
      .mockResolvedValueOnce([] as never); // trend
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.revenue.amount).toBe(1000 + Math.round(100 * 655.957));
    expect(body.revenue.amountsByCurrency).toEqual({ XOF: 1000, EUR: 100 });
  });

  it('response includes x-request-id header', async () => {
    const res = await callGet(makeGet());
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
