// GET /api/reviews — freelance-facing cursor list + average/count aggregate
// over client-submitted reviews. Pattern mirrors clients/route.test.ts.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function review(overrides: Partial<{ id: string; rating: number; createdAt: Date }> = {}) {
  return {
    id: overrides.id ?? 'r-1',
    rating: overrides.rating ?? 5,
    comment: 'Excellent travail, très professionnel.',
    createdAt: overrides.createdAt ?? new Date('2026-08-10T00:00:00Z'),
    client: { id: 'c-1', name: 'Bakeli Studio' },
    project: { id: 'p-1', name: 'Refonte identité visuelle' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: 0 } as never);
});

describe('GET /api/reviews', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/reviews'));
    expect(res.status).toBe(401);
  });

  it('empty result -> items:[], nextCursor:null, average:null, total:0', async () => {
    prismaMock.review.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/reviews'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [],
      nextCursor: null,
      average: null,
      total: 0,
    });
  });

  it('where clause scoped by userId on both findMany and aggregate', async () => {
    prismaMock.review.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/reviews'));

    const findManyArgs = prismaMock.review.findMany.mock.calls[0]?.[0];
    expect(findManyArgs?.where).toMatchObject({ userId: 'user-1' });

    const aggregateArgs = prismaMock.review.aggregate.mock.calls[0]?.[0];
    expect(aggregateArgs?.where).toEqual({ userId: 'user-1' });
  });

  it('returns rows + real average/count from the aggregate', async () => {
    prismaMock.review.findMany.mockResolvedValue([review()] as never);
    prismaMock.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.6 },
      _count: 12,
    } as never);

    const res = await GET(makeGet('http://test/api/reviews'));
    const body = await res.json();
    expect(body.average).toBe(4.6);
    expect(body.total).toBe(12);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].client.name).toBe('Bakeli Studio');
  });

  it('respects ?limit and paginates with a nextCursor when more rows exist', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      review({ id: `r-${i}`, createdAt: new Date(Date.now() - i * 1000) }),
    );
    prismaMock.review.findMany.mockResolvedValue(rows as never);

    const res = await GET(makeGet('http://test/api/reviews?limit=2'));
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).not.toBeNull();

    const findManyArgs = prismaMock.review.findMany.mock.calls[0]?.[0];
    expect(findManyArgs?.take).toBe(3);
  });
});
