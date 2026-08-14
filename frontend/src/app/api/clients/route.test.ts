// Phase A freelance CRM — /api/clients GET (cursor list) + POST (create).
// Pattern mirrors notifications/route.test.ts.
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
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/clients', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function client(
  overrides: Partial<{ id: string; code: string; createdAt: Date; status: string }> = {},
) {
  return {
    id: overrides.id ?? 'c-1',
    userId: 'user-1',
    code: overrides.code ?? 'CL-0001',
    name: 'Bakeli Studio',
    contactName: 'Fatoumata Diallo',
    email: 'fatoumata@bakeli.sn',
    phone: '+221771234567',
    status: overrides.status ?? 'active',
    imageUrl: null,
    createdAt: overrides.createdAt ?? new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    _count: { projects: 2 },
  };
}

function subscription(overrides: Partial<{ plan: string; status: string }> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    plan: overrides.plan ?? 'FREE',
    status: overrides.status ?? 'ACTIVE',
    billingCycle: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.subscription.findUnique.mockResolvedValue(subscription() as never);
});

describe('GET /api/clients', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/clients'));
    expect(res.status).toBe(401);
  });

  it('empty result -> { items: [], nextCursor: null }', async () => {
    prismaMock.client.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/clients'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('where clause scoped by userId', async () => {
    prismaMock.client.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/clients'));
    const args = prismaMock.client.findMany.mock.calls[0]?.[0];
    expect(args?.where?.userId).toBe('user-1');
  });

  it('?status=pending filters by status', async () => {
    prismaMock.client.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/clients?status=pending'));
    const args = prismaMock.client.findMany.mock.calls[0]?.[0];
    expect(args?.where?.status).toBe('pending');
  });

  it('includes project count and returns rows', async () => {
    prismaMock.client.findMany.mockResolvedValue([client()] as never);
    const res = await GET(makeGet('http://test/api/clients'));
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]._count.projects).toBe(2);
    const args = prismaMock.client.findMany.mock.calls[0]?.[0];
    const countArg = args?.include?._count;
    expect(countArg && typeof countArg === 'object' ? countArg.select?.projects : undefined).toBe(
      true,
    );
  });
});

describe('POST /api/clients', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await POST(makePost({ name: 'Acme' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail -> 401', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ name: 'Acme' }));
    expect(res.status).toBe(401);
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });

  it('missing required name -> 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ email: 'a@b.com' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });

  it('valid body -> 201, creates scoped to userId with a generated code', async () => {
    prismaMock.client.count.mockResolvedValue(0 as never);
    prismaMock.client.create.mockResolvedValue(client() as never);
    const res = await POST(
      makePost({
        name: 'Bakeli Studio',
        contactName: 'Fatoumata Diallo',
        email: 'fatoumata@bakeli.sn',
      }),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.client.create.mock.calls[0]?.[0];
    expect(createArg?.data?.userId).toBe('user-1');
    expect(createArg?.data?.name).toBe('Bakeli Studio');
    expect(createArg?.data?.code).toBe('CL-0001');
  });

  it('code collision -> retries with the next sequence number', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscription({ plan: 'PRO' }) as never);
    prismaMock.client.count.mockResolvedValue(4 as never);
    prismaMock.client.create
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'P2002' }))
      .mockResolvedValueOnce(client({ code: 'CL-0006' }) as never);
    const res = await POST(makePost({ name: 'Bakeli Studio' }));
    expect(res.status).toBe(201);
    expect(prismaMock.client.create).toHaveBeenCalledTimes(2);
    const secondArg = prismaMock.client.create.mock.calls[1]?.[0];
    expect(secondArg?.data?.code).toBe('CL-0006');
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs' and withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
