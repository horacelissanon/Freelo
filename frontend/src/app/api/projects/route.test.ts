// Phase A freelance CRM — /api/projects GET (cursor list) + POST (create).
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
  return new NextRequest('http://test/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function project(overrides: Partial<{ id: string; createdAt: Date }> = {}) {
  return {
    id: overrides.id ?? 'p-1',
    userId: 'user-1',
    clientId: 'c-1',
    name: 'Identité visuelle — Bakeli Studio',
    status: 'IN_PROGRESS',
    progress: 65,
    amount: 120000,
    currency: 'XOF',
    depositType: 'PERCENT',
    depositValue: 30,
    dueDate: null,
    step: 'Maquettes en revue',
    publicToken: 'tok-1',
    createdAt: overrides.createdAt ?? new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    client: { id: 'c-1', name: 'Bakeli Studio' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.subscription.findUnique.mockResolvedValue({
    id: 'sub-1',
    userId: 'user-1',
    plan: 'FREE',
    status: 'ACTIVE',
    billingCycle: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  // Default for GET's computeDepositBalanceBatch call — most tests don't
  // care about the acompte/solde figures and would otherwise crash
  // iterating the unmocked-deep-mock's `undefined` return.
  prismaMock.order.findMany.mockResolvedValue([] as never);
  prismaMock.invoice.findMany.mockResolvedValue([] as never);
});

describe('GET /api/projects', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/projects'));
    expect(res.status).toBe(401);
  });

  it('where clause scoped by userId', async () => {
    prismaMock.project.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/projects'));
    const args = prismaMock.project.findMany.mock.calls[0]?.[0];
    expect(args?.where?.userId).toBe('user-1');
  });

  it('?status and ?clientId filter the where clause', async () => {
    prismaMock.project.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/projects?status=DELIVERED&clientId=c-9'));
    const args = prismaMock.project.findMany.mock.calls[0]?.[0];
    expect(args?.where?.status).toBe('DELIVERED');
    expect(args?.where?.clientId).toBe('c-9');
  });

  it('?status=ACTIVE is a pseudo-filter for "not delivered yet", not an exact match', async () => {
    prismaMock.project.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/projects?status=ACTIVE'));
    const args = prismaMock.project.findMany.mock.calls[0]?.[0];
    expect(args?.where?.status).toEqual({ notIn: ['DELIVERED', 'DRAFT'] });
  });

  it('includes client name/id and returns rows', async () => {
    prismaMock.project.findMany.mockResolvedValue([project()] as never);
    const res = await GET(makeGet('http://test/api/projects'));
    const body = await res.json();
    expect(body.items[0].client).toEqual({ id: 'c-1', name: 'Bakeli Studio' });
  });

  it('attaches acompte/solde to each row via a single batched lookup, not one per row', async () => {
    prismaMock.project.findMany.mockResolvedValue([
      project({ id: 'p-1' }),
      project({ id: 'p-2' }),
    ] as never);
    prismaMock.order.findMany.mockResolvedValue([
      { amount: 40000, metadata: { projectId: 'p-1', docType: 'DEPOSIT' } },
    ] as never);

    const res = await GET(makeGet('http://test/api/projects'));
    const body = await res.json();
    expect(body.items[0].deposit).toEqual({ amount: 40000, paid: true });
    expect(body.items[1].deposit.paid).toBe(false);
    expect(prismaMock.order.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.invoice.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/projects', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await POST(
      makePost({ clientId: 'c-1', name: 'X', amount: 1000 }, { csrf: 'missing' }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('invalid body (missing amount) -> 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ clientId: 'c-1', name: 'X' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('clientId not owned by caller -> 404 CLIENT_NOT_FOUND', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null as never);
    const res = await POST(makePost({ clientId: 'someone-elses', name: 'X', amount: 1000 }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
    const findArg = prismaMock.client.findFirst.mock.calls[0]?.[0];
    expect(findArg?.where?.userId).toBe('user-1');
  });

  it('valid body -> 201, scoped to userId, defaults applied', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
    prismaMock.project.create.mockResolvedValue(project() as never);
    const res = await POST(
      makePost({ clientId: 'c-1', name: 'Identité visuelle', amount: 120000 }),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.project.create.mock.calls[0]?.[0];
    expect(createArg?.data?.userId).toBe('user-1');
    expect(createArg?.data?.status).toBe('PENDING');
    expect(createArg?.data?.progress).toBe(0);
    expect(createArg?.data?.currency).toBe('XOF');
  });

  it('no steps supplied -> falls back to the 4 default steps', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
    prismaMock.project.create.mockResolvedValue(project() as never);
    await POST(makePost({ clientId: 'c-1', name: 'X', amount: 1000 }));
    const createArg = prismaMock.project.create.mock.calls[0]?.[0];
    expect(createArg?.data?.steps?.create).toHaveLength(4);
  });

  it('custom steps supplied -> replaces the defaults, ordered sequentially', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
    prismaMock.project.create.mockResolvedValue(project() as never);
    await POST(
      makePost({
        clientId: 'c-1',
        name: 'X',
        amount: 1000,
        steps: [{ title: 'Brief' }, { title: 'Maquette', description: 'Premiers jets' }],
      }),
    );
    const createArg = prismaMock.project.create.mock.calls[0]?.[0];
    expect(createArg?.data?.steps?.create).toEqual([
      { order: 1, title: 'Brief' },
      { order: 2, title: 'Maquette', description: 'Premiers jets' },
    ]);
  });

  it('depositReceived without paymentMethod -> 400 VALIDATION_FAILED, no create', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
    const res = await POST(
      makePost({
        clientId: 'c-1',
        name: 'X',
        amount: 100000,
        depositReceived: true,
        depositAmount: 30000,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('depositAmount above the project amount -> 400 VALIDATION_FAILED, no create', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
    const res = await POST(
      makePost({
        clientId: 'c-1',
        name: 'X',
        amount: 100000,
        depositReceived: true,
        paymentMethod: 'WAVE',
        depositAmount: 150000,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('paymentMethod OTHER without paymentMethodLabel -> 400 VALIDATION_FAILED, no create', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
    const res = await POST(
      makePost({
        clientId: 'c-1',
        name: 'X',
        amount: 100000,
        depositReceived: true,
        depositAmount: 30000,
        paymentMethod: 'OTHER',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('depositReceived + paymentMethod -> records a PAID DEPOSIT Order for the real amount received, inside the same transaction', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
    prismaMock.project.create.mockResolvedValue({
      id: 'p-new',
      clientId: 'c-1',
      amount: 100000,
      currency: 'XOF',
      depositType: 'PERCENT',
      depositValue: 30,
    } as never);

    const res = await POST(
      makePost({
        clientId: 'c-1',
        name: 'X',
        amount: 100000,
        depositReceived: true,
        paymentMethod: 'WAVE',
        depositAmount: 20000,
      }),
    );
    expect(res.status).toBe(201);

    const orderArg = prismaMock.order.create.mock.calls[0]?.[0];
    // The freelance only received 20 000, not the full 30% (30 000) estimate.
    expect(orderArg?.data?.amount).toBe(20000);
    expect(orderArg?.data?.status).toBe('PAID');
    expect(orderArg?.data?.paymentMethod).toBe('WAVE');
    expect(orderArg?.data?.metadata).toEqual({ projectId: 'p-new', docType: 'DEPOSIT' });
  });

  it('paymentMethod OTHER + paymentMethodLabel -> label stored in the Order metadata', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
    prismaMock.project.create.mockResolvedValue({
      id: 'p-new',
      clientId: 'c-1',
      amount: 100000,
      currency: 'XOF',
      depositType: 'PERCENT',
      depositValue: 30,
    } as never);

    const res = await POST(
      makePost({
        clientId: 'c-1',
        name: 'X',
        amount: 100000,
        depositReceived: true,
        depositAmount: 30000,
        paymentMethod: 'OTHER',
        paymentMethodLabel: 'PayPal',
      }),
    );
    expect(res.status).toBe(201);

    const orderArg = prismaMock.order.create.mock.calls[0]?.[0];
    expect(orderArg?.data?.metadata).toEqual({
      projectId: 'p-new',
      docType: 'DEPOSIT',
      paymentMethodLabel: 'PayPal',
    });
  });

  it('no depositReceived -> no Order created, no transaction needed', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
    prismaMock.project.create.mockResolvedValue(project() as never);
    await POST(makePost({ clientId: 'c-1', name: 'X', amount: 100000 }));
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs' and withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
