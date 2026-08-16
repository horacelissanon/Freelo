import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET, PUT } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/settings/payment-methods');
}

function makePut(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/settings/payment-methods', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/settings/payment-methods', () => {
  it('lists the current user methods, ordered', async () => {
    prismaMock.defaultPaymentMethod.findMany.mockResolvedValue([
      { id: 'm-1', primaryText: 'Wave', secondaryText: '07 XX XX XX XX' },
    ] as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.methods).toEqual([
      { id: 'm-1', primaryText: 'Wave', secondaryText: '07 XX XX XX XX' },
    ]);
    const arg = prismaMock.defaultPaymentMethod.findMany.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ userId: 'user-1' });
    expect(arg?.orderBy).toEqual({ order: 'asc' });
  });
});

describe('PUT /api/settings/payment-methods', () => {
  it('missing x-csrf-token -> 403, no Prisma writes', async () => {
    const res = await PUT(makePut({ methods: [] }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.defaultPaymentMethod.deleteMany).not.toHaveBeenCalled();
  });

  it('invalid body -> 400 VALIDATION_FAILED', async () => {
    const res = await PUT(makePut({ methods: [{ primaryText: '' }] }));
    expect(res.status).toBe(400);
    expect(prismaMock.defaultPaymentMethod.deleteMany).not.toHaveBeenCalled();
  });

  it('more than 10 methods -> 400 VALIDATION_FAILED', async () => {
    const res = await PUT(
      makePut({ methods: Array.from({ length: 11 }, (_, i) => ({ primaryText: `M${i}` })) }),
    );
    expect(res.status).toBe(400);
  });

  it('replaces the whole list transactionally, reindexing order', async () => {
    prismaMock.defaultPaymentMethod.findMany.mockResolvedValue([
      { id: 'm-1', primaryText: 'Wave', secondaryText: '07 XX XX XX XX' },
      { id: 'm-2', primaryText: 'Virement', secondaryText: null },
    ] as never);

    const res = await PUT(
      makePut({
        methods: [
          { primaryText: 'Wave', secondaryText: '07 XX XX XX XX' },
          { primaryText: 'Virement' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.defaultPaymentMethod.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    const createArg = prismaMock.defaultPaymentMethod.createMany.mock.calls[0]?.[0];
    expect(createArg?.data).toEqual([
      { userId: 'user-1', order: 1, primaryText: 'Wave', secondaryText: '07 XX XX XX XX' },
      { userId: 'user-1', order: 2, primaryText: 'Virement' },
    ]);
    const body = await res.json();
    expect(body.methods).toHaveLength(2);
  });

  it('empty list clears all methods without calling createMany', async () => {
    const res = await PUT(makePut({ methods: [] }));
    expect(res.status).toBe(200);
    expect(prismaMock.defaultPaymentMethod.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prismaMock.defaultPaymentMethod.createMany).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.methods).toEqual([]);
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs' and withRequestContext", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
