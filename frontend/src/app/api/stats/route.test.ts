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

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/stats', { method: 'GET' });
}

// `invoice.groupBy`'s heavily-overloaded generic signature defeats
// vitest-mock-extended's type inference for `.mockResolvedValue` — cast
// through `Mock` (it's still the same underlying vi.fn at runtime).
type AnyMock = ReturnType<typeof vi.fn>;
function mockGroupBy(value: unknown): void {
  (prismaMock.invoice.groupBy as unknown as AnyMock).mockResolvedValue(value);
}

function stubDefaults() {
  prismaMock.invoice.aggregate.mockResolvedValue({ _sum: { amount: 0 } } as never);
  prismaMock.project.aggregate.mockResolvedValue({ _avg: { amount: null } } as never);
  prismaMock.invoice.count.mockResolvedValue(0 as never);
  prismaMock.project.findMany.mockResolvedValue([] as never);
  mockGroupBy([]);
  prismaMock.invoice.findMany.mockResolvedValue([] as never);
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
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('all-zero baseline -> zeroed overview, empty breakdowns, no suggestions', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overview).toEqual({
      revenue: { amount: 0, currency: 'XOF', trendPercent: null },
      avgProjectValue: null,
      overdueRate: null,
    });
    expect(body.revenueByProjectType).toEqual([]);
    expect(body.topClients).toEqual([]);
    expect(body.suggestions).toEqual([]);
    expect(body.revenueTrend).toHaveLength(12);
    for (const bucket of body.revenueTrend) {
      expect(bucket).toEqual({ month: expect.stringMatching(/^\d{4}-\d{2}$/), amount: 0 });
    }
  });

  it('avgProjectValue rounds the DELIVERED-project average', async () => {
    prismaMock.project.aggregate.mockResolvedValue({ _avg: { amount: 123456.7 } } as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.overview.avgProjectValue).toEqual({ amount: 123457, currency: 'XOF' });
  });

  it('overdueRate = overdue count / non-draft count, rounded', async () => {
    prismaMock.invoice.count
      .mockResolvedValueOnce(4 as never) // non-draft (SENT+PAID+OVERDUE)
      .mockResolvedValueOnce(1 as never); // overdue
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.overview.overdueRate).toBe(25);
  });

  it('revenueByProjectType buckets DELIVERED projects by type with share percent', async () => {
    prismaMock.project.findMany.mockResolvedValue([
      { type: 'LOGO', amount: 100000 },
      { type: 'LOGO', amount: 50000 },
      { type: 'UI_WEB', amount: 50000 },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.revenueByProjectType).toEqual([
      { type: 'LOGO', label: 'Logo', amount: 150000, count: 2, sharePercent: 75 },
      { type: 'UI_WEB', label: 'UI / Web', amount: 50000, count: 1, sharePercent: 25 },
    ]);
  });

  it('topClients resolves client names for the groupBy result, sorted by amount desc', async () => {
    mockGroupBy([
      { clientId: 'c-1', _sum: { amount: 90000 } },
      { clientId: 'c-2', _sum: { amount: 40000 } },
    ]);
    prismaMock.client.findMany.mockResolvedValue([
      { id: 'c-1', name: 'Acme' },
      { id: 'c-2', name: 'Beta' },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.topClients).toEqual([
      { clientId: 'c-1', name: 'Acme', amount: 90000 },
      { clientId: 'c-2', name: 'Beta', amount: 40000 },
    ]);
  });

  it('suggests relance for overdue invoices (warning)', async () => {
    prismaMock.invoice.count
      .mockResolvedValueOnce(3 as never) // non-draft
      .mockResolvedValueOnce(2 as never); // overdue
    const res = await GET(makeGet());
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
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.suggestions).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('devis') }),
    );
  });

  it('suggests on revenue drop vs last month (warning)', async () => {
    prismaMock.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 50000 } } as never) // this month
      .mockResolvedValueOnce({ _sum: { amount: 100000 } } as never); // last month
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.overview.revenue.trendPercent).toBe(-50);
    expect(body.suggestions).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('baissé') }),
    );
  });

  it('suggests dominant project type when share >= 50% (info)', async () => {
    prismaMock.project.findMany.mockResolvedValue([
      { type: 'LOGO', amount: 80000 },
      { type: 'UI_WEB', amount: 20000 },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.suggestions).toContainEqual(
      expect.objectContaining({ severity: 'info', message: expect.stringContaining('Logo') }),
    );
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
