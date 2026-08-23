// Project -> Invoice generation. clientId/projectId are never accepted from
// the request body — always derived server-side from the Project row, so a
// tampered body can't attach the resulting invoice to a different client.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/projects/p-1/create-invoice', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function project() {
  return { id: 'p-1', userId: 'user-1', clientId: 'c-1' };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    lineItems: [{ designation: 'Solde du projet', quantity: 1, unitPrice: 100000 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.project.findFirst.mockResolvedValue(project() as never);
  prismaMock.invoice.count.mockResolvedValue(0 as never);
  prismaMock.user.findUnique.mockResolvedValue({ defaultCurrency: 'XOF' } as never);
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
  prismaMock.planConfig.findUnique.mockResolvedValue({
    id: 'plan-free',
    plan: 'FREE',
    monthlyAmount: null,
    yearlyAmount: null,
    currency: 'XOF',
    maxClients: 1,
    maxActiveProjects: 2,
    maxInvoices: 1,
    maxQuotes: 1,
    features: [],
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  } as never);
});

describe('POST /api/projects/[id]/create-invoice', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await POST(makePost(validBody(), { csrf: 'missing' }), ctxWith('p-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('project not owned by caller -> 404 PROJECT_NOT_FOUND', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await POST(makePost(validBody()), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
  });

  it('invalid body (no lineItems) -> 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({}), ctxWith('p-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('FREE plan + non-XOF currency -> 403 PLAN_LIMIT_CURRENCY, no create', async () => {
    const res = await POST(
      makePost(validBody({ currency: 'EUR', exchangeRateToDefault: 655.957 })),
      ctxWith('p-1'),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PLAN_LIMIT_CURRENCY');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('FREE plan + already 1 INVOICE -> 403 PLAN_LIMIT_INVOICES, no create', async () => {
    prismaMock.invoice.count.mockResolvedValue(1 as never);
    const res = await POST(makePost(validBody()), ctxWith('p-1'));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PLAN_LIMIT_INVOICES');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('depositAmount exceeding the computed total -> 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost(validBody({ depositAmount: 999999999 })), ctxWith('p-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('happy path -> 201, invoice scoped to caller + project client, docType INVOICE', async () => {
    prismaMock.invoice.create.mockResolvedValue({ id: 'inv-new', clientId: 'c-1' } as never);

    const res = await POST(makePost(validBody()), ctxWith('p-1'));
    expect(res.status).toBe(201);

    const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
    expect(createArg?.data?.userId).toBe('user-1');
    expect(createArg?.data?.clientId).toBe('c-1');
    expect(createArg?.data?.projectId).toBe('p-1');
    expect(createArg?.data?.docType).toBe('INVOICE');
    expect(createArg?.data?.amount).toBe(100000);
  });

  it('a clientId/projectId sent in the body is ignored — always derived from the project', async () => {
    prismaMock.invoice.create.mockResolvedValue({ id: 'inv-new' } as never);

    await POST(
      makePost(validBody({ clientId: 'someone-elses-client', projectId: 'someone-elses-project' })),
      ctxWith('p-1'),
    );

    const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
    expect(createArg?.data?.clientId).toBe('c-1');
    expect(createArg?.data?.projectId).toBe('p-1');
  });

  it('number generation retries on a unique-constraint conflict, then succeeds', async () => {
    const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
    prismaMock.invoice.create
      .mockRejectedValueOnce(conflict as never)
      .mockResolvedValueOnce({ id: 'inv-new' } as never);

    const res = await POST(makePost(validBody()), ctxWith('p-1'));
    expect(res.status).toBe(201);
    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(2);
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
