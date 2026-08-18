// Statistiques — GET /api/stats. Mirrors the mocking pattern from
// app/api/dashboard/stats/route.test.ts (Phase A).
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
  return new NextRequest('http://test/api/stats', { method: 'GET' });
}

// Dynamic import (not a static top-level one) — './route' transitively pulls
// in the mocked '@/lib/server/fx/rates', whose factory closes over the
// module-scoped `getCachedRates` const above. A static import gets evaluated
// before that const initializes (TDZ), so the module must load lazily here,
// same pattern as dashboard/stats/route.test.ts.
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
  prismaMock.invoice.count.mockResolvedValue(0 as never);
  prismaMock.project.findMany.mockResolvedValue([] as never);
  prismaMock.client.findMany.mockResolvedValue([] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  stubDefaults();
});

describe('GET /api/stats', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await callGet(makeGet());
    expect(res.status).toBe(401);
  });

  it('all-zero baseline -> zeroed overview, empty breakdowns, no suggestions', async () => {
    const res = await callGet(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overview).toEqual({
      revenue: { amount: 0, currency: 'XOF', amountsByCurrency: {}, trendPercent: null },
      avgProjectValue: null,
      overdueRate: null,
    });
    expect(body.revenueByProjectType).toEqual([]);
    expect(body.topClients).toEqual([]);
    expect(body.suggestions).toEqual([]);
    expect(body.revenueTrend).toHaveLength(12);
    for (const bucket of body.revenueTrend) {
      expect(bucket).toEqual({
        month: expect.stringMatching(/^\d{4}-\d{2}$/),
        amount: 0,
        amountsByCurrency: {},
      });
    }
  });

  it('avgProjectValue rounds the DELIVERED-project average', async () => {
    prismaMock.project.findMany.mockResolvedValue([
      { type: 'LOGO', amount: 100000, currency: 'XOF', exchangeRateToDefault: null },
      { type: 'LOGO', amount: 100000, currency: 'XOF', exchangeRateToDefault: null },
      { type: 'LOGO', amount: 100002, currency: 'XOF', exchangeRateToDefault: null },
    ] as never);
    const res = await callGet(makeGet());
    const body = await res.json();
    // (100000 + 100000 + 100002) / 3 = 100000.666... -> rounds to 100001
    expect(body.overview.avgProjectValue).toEqual({ amount: 100001, currency: 'XOF' });
  });

  it('overdueRate = overdue count / non-draft count, rounded', async () => {
    prismaMock.invoice.count
      .mockResolvedValueOnce(4 as never) // non-draft (SENT+PAID+OVERDUE)
      .mockResolvedValueOnce(1 as never); // overdue
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.overview.overdueRate).toBe(25);
  });

  it('revenueByProjectType buckets DELIVERED projects by type with share percent', async () => {
    prismaMock.project.findMany.mockResolvedValue([
      { type: 'LOGO', amount: 100000, currency: 'XOF', exchangeRateToDefault: null },
      { type: 'LOGO', amount: 50000, currency: 'XOF', exchangeRateToDefault: null },
      { type: 'UI_WEB', amount: 50000, currency: 'XOF', exchangeRateToDefault: null },
    ] as never);
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.revenueByProjectType).toEqual([
      { type: 'LOGO', label: 'Logo', amount: 150000, count: 2, sharePercent: 75 },
      { type: 'UI_WEB', label: 'UI / Web', amount: 50000, count: 1, sharePercent: 25 },
    ]);
  });

  it('topClients resolves client names for the paid-invoices ranking, sorted by amount desc', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([] as never) // this month revenue
      .mockResolvedValueOnce([] as never) // last month revenue
      .mockResolvedValueOnce([
        { clientId: 'c-1', amount: 90000, currency: 'XOF', exchangeRateToDefault: null },
        { clientId: 'c-2', amount: 40000, currency: 'XOF', exchangeRateToDefault: null },
      ] as never); // paid invoices for top-clients ranking
    prismaMock.client.findMany.mockResolvedValue([
      { id: 'c-1', name: 'Acme' },
      { id: 'c-2', name: 'Beta' },
    ] as never);
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.topClients).toEqual([
      { clientId: 'c-1', name: 'Acme', amount: 90000 },
      { clientId: 'c-2', name: 'Beta', amount: 40000 },
    ]);
  });

  it("sums a single client's invoices across currencies using each row's frozen rate", async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([] as never) // this month revenue
      .mockResolvedValueOnce([] as never) // last month revenue
      .mockResolvedValueOnce([
        { clientId: 'c-1', amount: 50000, currency: 'XOF', exchangeRateToDefault: null },
        { clientId: 'c-1', amount: 100, currency: 'EUR', exchangeRateToDefault: 655.957 },
      ] as never); // paid invoices for top-clients ranking
    prismaMock.client.findMany.mockResolvedValue([{ id: 'c-1', name: 'Acme' }] as never);
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.topClients).toEqual([
      { clientId: 'c-1', name: 'Acme', amount: 50000 + Math.round(100 * 655.957) },
    ]);
  });

  it('overview.revenue converts a non-default-currency row using its frozen rate, and reports the raw breakdown', async () => {
    prismaMock.invoice.findMany.mockResolvedValueOnce([
      { amount: 1000, currency: 'XOF', exchangeRateToDefault: null },
      { amount: 100, currency: 'EUR', exchangeRateToDefault: 655.957 },
    ] as never); // this month
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.overview.revenue.amount).toBe(1000 + Math.round(100 * 655.957));
    expect(body.overview.revenue.amountsByCurrency).toEqual({ XOF: 1000, EUR: 100 });
  });

  it('suggests relance for overdue invoices (warning)', async () => {
    prismaMock.invoice.count
      .mockResolvedValueOnce(3 as never) // non-draft
      .mockResolvedValueOnce(2 as never); // overdue
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.suggestions).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('retard') }),
    );
  });

  it('suggests relance for stale quotes older than 14 days (warning)', async () => {
    prismaMock.invoice.count
      .mockResolvedValueOnce(0 as never) // non-draft
      .mockResolvedValueOnce(0 as never) // overdue
      .mockResolvedValueOnce(3 as never); // stale quotes
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.suggestions).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('devis') }),
    );
  });

  it('suggests on revenue drop vs last month (warning)', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([
        { amount: 50000, currency: 'XOF', exchangeRateToDefault: null },
      ] as never) // this month
      .mockResolvedValueOnce([
        { amount: 100000, currency: 'XOF', exchangeRateToDefault: null },
      ] as never); // last month
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.overview.revenue.trendPercent).toBe(-50);
    expect(body.suggestions).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('baissé') }),
    );
  });

  it('suggests dominant project type when share >= 50% (info)', async () => {
    prismaMock.project.findMany.mockResolvedValue([
      { type: 'LOGO', amount: 80000, currency: 'XOF', exchangeRateToDefault: null },
      { type: 'UI_WEB', amount: 20000, currency: 'XOF', exchangeRateToDefault: null },
    ] as never);
    const res = await callGet(makeGet());
    const body = await res.json();
    expect(body.suggestions).toContainEqual(
      expect.objectContaining({ severity: 'info', message: expect.stringContaining('Logo') }),
    );
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
