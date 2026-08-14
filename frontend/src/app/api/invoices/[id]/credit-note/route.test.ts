// No-hard-delete business rule: the only way to void an INVOICE is to
// issue a CREDIT_NOTE that fully mirrors its amount/currency/client/
// project, with the original flipping to CANCELED in the same transaction.
// One credit note per invoice — enforced both by the pre-flight `creditNote`
// check here and by the DB's `relatedInvoiceId @unique` constraint.
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

function makePost(opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/invoices/i-1/credit-note', {
    method: 'POST',
    headers,
    body: '',
  });
}

function original(
  overrides: Partial<{ docType: string; status: string; creditNote: { id: string } | null }> = {},
) {
  return {
    id: 'i-1',
    userId: 'user-1',
    clientId: 'c-1',
    projectId: 'p-1',
    docType: overrides.docType ?? 'INVOICE',
    number: '2026-001',
    amount: 60000,
    currency: 'XOF',
    status: overrides.status ?? 'SENT',
    creditNote: overrides.creditNote === undefined ? null : overrides.creditNote,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.invoice.findFirst.mockResolvedValue(original() as never);
  prismaMock.invoice.count.mockResolvedValue(0 as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/invoices/[id]/credit-note', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await POST(makePost({ csrf: 'missing' }), ctxWith('i-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('invoice not owned by caller -> 404 INVOICE_NOT_FOUND', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null as never);
    const res = await POST(makePost(), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVOICE_NOT_FOUND');
  });

  it('QUOTE docType -> 409 NOT_AN_INVOICE, no create', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(original({ docType: 'QUOTE' }) as never);
    const res = await POST(makePost(), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NOT_AN_INVOICE');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('already CANCELED -> 409 INVOICE_ALREADY_CANCELED, no create', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(original({ status: 'CANCELED' }) as never);
    const res = await POST(makePost(), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVOICE_ALREADY_CANCELED');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('credit note already exists -> 409 CREDIT_NOTE_ALREADY_EXISTS, no create', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(
      original({ creditNote: { id: 'cn-1' } }) as never,
    );
    const res = await POST(makePost(), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CREDIT_NOTE_ALREADY_EXISTS');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('happy path: creates CREDIT_NOTE mirroring the original, cancels the original', async () => {
    const year = new Date().getFullYear();
    prismaMock.invoice.create.mockResolvedValue({
      id: 'cn-1',
      docType: 'CREDIT_NOTE',
      number: `AV-${year}-001`,
      amount: 60000,
      currency: 'XOF',
      relatedInvoiceId: 'i-1',
    } as never);
    prismaMock.invoice.update.mockResolvedValue({ id: 'i-1', status: 'CANCELED' } as never);

    const res = await POST(makePost(), ctxWith('i-1'));
    expect(res.status).toBe(201);

    const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
    expect(createArg?.data?.userId).toBe('user-1');
    expect(createArg?.data?.clientId).toBe('c-1');
    expect(createArg?.data?.projectId).toBe('p-1');
    expect(createArg?.data?.docType).toBe('CREDIT_NOTE');
    expect(createArg?.data?.number).toBe(`AV-${year}-001`);
    expect(createArg?.data?.amount).toBe(60000);
    expect(createArg?.data?.currency).toBe('XOF');
    expect(createArg?.data?.relatedInvoiceId).toBe('i-1');

    const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'i-1' });
    expect(updateArg?.data).toEqual({ status: 'CANCELED' });
  });

  it('P2002 unique conflict retries with a higher sequence, then succeeds', async () => {
    const conflict = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    prismaMock.invoice.create
      .mockRejectedValueOnce(conflict as never)
      .mockResolvedValueOnce({ id: 'cn-1', docType: 'CREDIT_NOTE' } as never);
    prismaMock.invoice.update.mockResolvedValue({ id: 'i-1', status: 'CANCELED' } as never);

    const res = await POST(makePost(), ctxWith('i-1'));
    expect(res.status).toBe(201);
    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(2);
  });

  it('P2002 conflict on every retry -> 409 NUMBER_GENERATION_FAILED', async () => {
    const conflict = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    prismaMock.invoice.create.mockRejectedValue(conflict as never);
    const res = await POST(makePost(), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NUMBER_GENERATION_FAILED');
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
