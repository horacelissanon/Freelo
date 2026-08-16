// Devis → Project conversion, once a client has accepted the quote.
// `clientId` is never accepted from the request body — always derived
// server-side from the Invoice row, so a tampered body can't attach the
// resulting project to a different client than the one who validated the
// devis. Mirrors the credit-note route's ownership/guard/transaction shape.
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
  return new NextRequest('http://test/api/invoices/i-1/create-project', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function invoice(
  overrides: Partial<{
    docType: string;
    status: string;
    projectId: string | null;
  }> = {},
) {
  return {
    id: 'i-1',
    userId: 'user-1',
    clientId: 'c-1',
    docType: overrides.docType ?? 'QUOTE',
    status: overrides.status ?? 'ACCEPTED',
    projectId: overrides.projectId === undefined ? null : overrides.projectId,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { name: 'Site vitrine', amount: 120000, currency: 'XOF', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.invoice.findFirst.mockResolvedValue(invoice() as never);
  prismaMock.project.count.mockResolvedValue(0 as never);
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
});

describe('POST /api/invoices/[id]/create-project', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await POST(makePost(validBody(), { csrf: 'missing' }), ctxWith('i-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('invoice not owned by caller -> 404 INVOICE_NOT_FOUND', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null as never);
    const res = await POST(makePost(validBody()), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVOICE_NOT_FOUND');
  });

  it('docType INVOICE -> 409 NOT_A_QUOTE, no create', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoice({ docType: 'INVOICE' }) as never);
    const res = await POST(makePost(validBody()), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NOT_A_QUOTE');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('status SENT (not yet accepted) -> 409 QUOTE_NOT_ACCEPTED, no create', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoice({ status: 'SENT' }) as never);
    const res = await POST(makePost(validBody()), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('QUOTE_NOT_ACCEPTED');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('already has a linked project -> 409 PROJECT_ALREADY_EXISTS, no create', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoice({ projectId: 'p-existing' }) as never);
    const res = await POST(makePost(validBody()), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('PROJECT_ALREADY_EXISTS');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('invalid body (missing amount) -> 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ name: 'X' }), ctxWith('i-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('FREE plan + non-XOF currency -> 403 PLAN_LIMIT_CURRENCY', async () => {
    const res = await POST(makePost(validBody({ currency: 'EUR' })), ctxWith('i-1'));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PLAN_LIMIT_CURRENCY');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('FREE plan already at the active-project limit -> 403 PLAN_LIMIT_PROJECTS', async () => {
    prismaMock.project.count.mockResolvedValue(2 as never);
    const res = await POST(makePost(validBody()), ctxWith('i-1'));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PLAN_LIMIT_PROJECTS');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('happy path -> 201, project scoped to caller + invoice client, invoice linked in the same transaction', async () => {
    prismaMock.project.create.mockResolvedValue({ id: 'p-new', clientId: 'c-1' } as never);
    prismaMock.invoice.update.mockResolvedValue({ id: 'i-1', projectId: 'p-new' } as never);

    const res = await POST(makePost(validBody({ name: 'Site vitrine' })), ctxWith('i-1'));
    expect(res.status).toBe(201);

    const createArg = prismaMock.project.create.mock.calls[0]?.[0];
    expect(createArg?.data?.userId).toBe('user-1');
    expect(createArg?.data?.clientId).toBe('c-1');
    expect(createArg?.data?.name).toBe('Site vitrine');
    expect(createArg?.data?.amount).toBe(120000);
    expect(createArg?.data?.status).toBe('IN_PROGRESS');
    expect(createArg?.data?.progress).toBe(0);

    const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'i-1' });
    expect(updateArg?.data).toEqual({ projectId: 'p-new' });
  });

  it('a clientId sent in the body is ignored — project always uses invoice.clientId', async () => {
    prismaMock.project.create.mockResolvedValue({ id: 'p-new', clientId: 'c-1' } as never);
    prismaMock.invoice.update.mockResolvedValue({ id: 'i-1', projectId: 'p-new' } as never);

    await POST(makePost(validBody({ clientId: 'someone-elses-client' })), ctxWith('i-1'));

    const createArg = prismaMock.project.create.mock.calls[0]?.[0];
    expect(createArg?.data?.clientId).toBe('c-1');
  });

  it('no steps supplied -> falls back to the 4 default steps', async () => {
    prismaMock.project.create.mockResolvedValue({ id: 'p-new' } as never);
    prismaMock.invoice.update.mockResolvedValue({ id: 'i-1' } as never);
    await POST(makePost(validBody()), ctxWith('i-1'));
    const createArg = prismaMock.project.create.mock.calls[0]?.[0];
    expect(createArg?.data?.steps?.create).toHaveLength(4);
  });

  it('depositReceived without paymentMethod -> 400 VALIDATION_FAILED, no create', async () => {
    const res = await POST(
      makePost(validBody({ depositReceived: true, depositAmount: 30000 })),
      ctxWith('i-1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('depositReceived without depositAmount -> 400 VALIDATION_FAILED, no create', async () => {
    const res = await POST(
      makePost(validBody({ depositReceived: true, paymentMethod: 'WAVE' })),
      ctxWith('i-1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('depositAmount above the project amount -> 400 VALIDATION_FAILED, no create', async () => {
    const res = await POST(
      makePost(
        validBody({
          amount: 100000,
          depositReceived: true,
          paymentMethod: 'WAVE',
          depositAmount: 150000,
        }),
      ),
      ctxWith('i-1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('depositReceived + paymentMethod -> records a PAID DEPOSIT Order using the freelance-entered amount, even a partial one', async () => {
    prismaMock.project.create.mockResolvedValue({
      id: 'p-new',
      clientId: 'c-1',
      amount: 100000,
      currency: 'XOF',
      depositPercent: 30,
    } as never);
    prismaMock.invoice.update.mockResolvedValue({ id: 'i-1', projectId: 'p-new' } as never);

    const res = await POST(
      makePost(
        validBody({
          amount: 100000,
          depositReceived: true,
          paymentMethod: 'WAVE',
          depositAmount: 20000,
        }),
      ),
      ctxWith('i-1'),
    );
    expect(res.status).toBe(201);

    const orderArg = prismaMock.order.create.mock.calls[0]?.[0];
    // Freelance only received 20 000, not the full 30% (30 000) estimate.
    expect(orderArg?.data?.amount).toBe(20000);
    expect(orderArg?.data?.currency).toBe('XOF');
    expect(orderArg?.data?.status).toBe('PAID');
    expect(orderArg?.data?.paymentMethod).toBe('WAVE');
    expect(orderArg?.data?.metadata).toEqual({ projectId: 'p-new', docType: 'DEPOSIT' });
  });

  it('paymentMethod OTHER without paymentMethodLabel -> 400 VALIDATION_FAILED, no create', async () => {
    const res = await POST(
      makePost(validBody({ depositReceived: true, depositAmount: 30000, paymentMethod: 'OTHER' })),
      ctxWith('i-1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('paymentMethod OTHER + paymentMethodLabel -> label stored in the Order metadata', async () => {
    prismaMock.project.create.mockResolvedValue({
      id: 'p-new',
      clientId: 'c-1',
      amount: 100000,
      currency: 'XOF',
      depositPercent: 30,
    } as never);
    prismaMock.invoice.update.mockResolvedValue({ id: 'i-1', projectId: 'p-new' } as never);

    const res = await POST(
      makePost(
        validBody({
          amount: 100000,
          depositReceived: true,
          depositAmount: 30000,
          paymentMethod: 'OTHER',
          paymentMethodLabel: 'PayPal',
        }),
      ),
      ctxWith('i-1'),
    );
    expect(res.status).toBe(201);

    const orderArg = prismaMock.order.create.mock.calls[0]?.[0];
    expect(orderArg?.data?.paymentMethod).toBe('OTHER');
    expect(orderArg?.data?.metadata).toEqual({
      projectId: 'p-new',
      docType: 'DEPOSIT',
      paymentMethodLabel: 'PayPal',
    });
  });

  it('no depositReceived -> no Order created', async () => {
    prismaMock.project.create.mockResolvedValue({
      id: 'p-new',
      clientId: 'c-1',
      amount: 100000,
      currency: 'XOF',
      depositPercent: 30,
    } as never);
    prismaMock.invoice.update.mockResolvedValue({ id: 'i-1', projectId: 'p-new' } as never);

    await POST(makePost(validBody()), ctxWith('i-1'));
    expect(prismaMock.order.create).not.toHaveBeenCalled();
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
