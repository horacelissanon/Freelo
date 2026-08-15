// GET: ownership-scoped single-invoice detail (client/project/credit-note
// relations). PATCH: manual status reconciliation only — refuses to touch
// CREDIT_NOTE rows or already-CANCELED invoices, and can never set CANCELED
// directly (only POST /credit-note can do that, atomically with the
// original invoice — see the no-hard-delete business rule in credit-note's
// route test).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET, PATCH, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeGet(id: string): NextRequest {
  return new NextRequest(`http://test/api/invoices/${id}`);
}

function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/invoices/i-1', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

function makeDelete(opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = {};
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/invoices/i-1', { method: 'DELETE', headers });
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

function invoice(
  overrides: Partial<{
    docType: string;
    status: string;
    amount: number;
    depositAmount: number;
  }> = {},
) {
  return {
    id: 'i-1',
    userId: 'user-1',
    clientId: 'c-1',
    projectId: null,
    docType: overrides.docType ?? 'INVOICE',
    number: '2026-001',
    description: null,
    amount: overrides.amount ?? 60000,
    depositAmount: overrides.depositAmount ?? null,
    currency: 'XOF',
    status: overrides.status ?? 'DRAFT',
    issueDate: new Date('2026-05-01T00:00:00Z'),
    dueDate: null,
    orderId: null,
    relatedInvoiceId: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    client: { id: 'c-1', name: 'Bakeli Studio' },
    project: null,
    relatedInvoice: null,
    creditNote: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.invoice.findFirst.mockResolvedValue(invoice() as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/invoices/[id]', () => {
  it('invoice not owned by caller -> 404 INVOICE_NOT_FOUND', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null as never);
    const res = await GET(makeGet('someone-elses'), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVOICE_NOT_FOUND');
  });

  it('returns invoice with client/project/credit-note relations', async () => {
    const res = await GET(makeGet('i-1'), ctxWith('i-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('i-1');
    expect(body.client.name).toBe('Bakeli Studio');
  });

  it('includes lineItems (flat, packId:null) and packs.items', async () => {
    await GET(makeGet('i-1'), ctxWith('i-1'));
    const findArg = prismaMock.invoice.findFirst.mock.calls[0]?.[0];
    expect(findArg?.include?.lineItems).toEqual({
      where: { packId: null },
      orderBy: { order: 'asc' },
    });
    expect(findArg?.include?.packs).toBeTruthy();
  });
});

describe('PATCH /api/invoices/[id]', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await PATCH(makePatch({ status: 'PAID' }, { csrf: 'missing' }), ctxWith('i-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('invoice not owned by caller -> 404 INVOICE_NOT_FOUND', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null as never);
    const res = await PATCH(makePatch({ status: 'PAID' }), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVOICE_NOT_FOUND');
  });

  it('CREDIT_NOTE row -> 409 CREDIT_NOTE_IMMUTABLE, no update', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoice({ docType: 'CREDIT_NOTE' }) as never);
    const res = await PATCH(makePatch({ status: 'PAID' }), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CREDIT_NOTE_IMMUTABLE');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('already CANCELED invoice -> 409 INVOICE_CANCELED, no update', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoice({ status: 'CANCELED' }) as never);
    const res = await PATCH(makePatch({ status: 'PAID' }), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVOICE_CANCELED');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('status: CANCELED rejected by schema -> 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({ status: 'CANCELED' }), ctxWith('i-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('valid status transition -> 200, updates only status', async () => {
    prismaMock.invoice.update.mockResolvedValue(invoice({ status: 'PAID' }) as never);
    const res = await PATCH(makePatch({ status: 'PAID' }), ctxWith('i-1'));
    expect(res.status).toBe(200);
    const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ status: 'PAID' });
  });

  it('content edit on a DRAFT invoice -> 200, updates the provided fields', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-2' } as never);
    prismaMock.invoice.update.mockResolvedValue(invoice() as never);
    const res = await PATCH(
      makePatch({ clientId: 'c-2', description: 'Solde final' }),
      ctxWith('i-1'),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ clientId: 'c-2', description: 'Solde final' });
  });

  it('content edit on a non-DRAFT invoice -> 409 INVOICE_NOT_EDITABLE, no update', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoice({ status: 'SENT' }) as never);
    const res = await PATCH(makePatch({ description: 'Solde final' }), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVOICE_NOT_EDITABLE');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('status change on a non-DRAFT invoice is still allowed (not a content edit)', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoice({ status: 'SENT' }) as never);
    prismaMock.invoice.update.mockResolvedValue(invoice({ status: 'PAID' }) as never);
    const res = await PATCH(makePatch({ status: 'PAID' }), ctxWith('i-1'));
    expect(res.status).toBe(200);
  });

  it('clientId not owned -> 404 CLIENT_NOT_FOUND, no update', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null as never);
    const res = await PATCH(makePatch({ clientId: 'someone-elses' }), ctxWith('i-1'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('projectId not owned -> 404 PROJECT_NOT_FOUND, no update', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await PATCH(makePatch({ projectId: 'someone-elses' }), ctxWith('i-1'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('currency changed to non-XOF on FREE plan -> 403 PLAN_LIMIT_CURRENCY, no update', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscription() as never);
    const res = await PATCH(makePatch({ currency: 'EUR' }), ctxWith('i-1'));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PLAN_LIMIT_CURRENCY');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('currency changed to non-XOF on PRO plan -> 200, updates currency', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscription({ plan: 'PRO' }) as never);
    prismaMock.invoice.update.mockResolvedValue(invoice({ currency: 'EUR' } as never) as never);
    const res = await PATCH(makePatch({ currency: 'EUR' }), ctxWith('i-1'));
    expect(res.status).toBe(200);
    const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ currency: 'EUR' });
  });

  it('dueDate: null clears the date on a DRAFT invoice', async () => {
    prismaMock.invoice.update.mockResolvedValue(invoice() as never);
    await PATCH(makePatch({ dueDate: null }), ctxWith('i-1'));
    const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ dueDate: null });
  });

  describe('line items bulk-replace (INVOICE only)', () => {
    it('lineItems on a DRAFT invoice -> deleteMany + createMany in a transaction, amount recomputed', async () => {
      prismaMock.invoice.update.mockResolvedValue(invoice({ amount: 45000 }) as never);
      const res = await PATCH(
        makePatch({
          lineItems: [
            { designation: 'Logo', quantity: 1, unitPrice: 30000 },
            { designation: 'Retouche', quantity: 3, unitPrice: 5000 },
          ],
        }),
        ctxWith('i-1'),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.invoiceLineItem.deleteMany).toHaveBeenCalledWith({
        where: { invoiceId: 'i-1', packId: null },
      });
      expect(prismaMock.invoiceLineItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            invoiceId: 'i-1',
            order: 1,
            designation: 'Logo',
            quantity: 1,
            unitPrice: 30000,
          }),
          expect.objectContaining({
            invoiceId: 'i-1',
            order: 2,
            designation: 'Retouche',
            quantity: 3,
            unitPrice: 5000,
          }),
        ],
      });
      const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
      expect(updateArg?.data).toEqual({ amount: 45000 });
    });

    it('lineItems against a QUOTE -> 400 VALIDATION_FAILED, no transaction', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(invoice({ docType: 'QUOTE' }) as never);
      const res = await PATCH(
        makePatch({ lineItems: [{ designation: 'X', quantity: 1, unitPrice: 1000 }] }),
        ctxWith('i-1'),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('amount against an INVOICE -> 400 VALIDATION_FAILED, no update', async () => {
      const res = await PATCH(makePatch({ amount: 90000 }), ctxWith('i-1'));
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });

    it('amount against a QUOTE (transitional) still works -> 200', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(invoice({ docType: 'QUOTE' }) as never);
      prismaMock.invoice.update.mockResolvedValue(invoice({ docType: 'QUOTE' }) as never);
      const res = await PATCH(makePatch({ amount: 90000 }), ctxWith('i-1'));
      expect(res.status).toBe(200);
      const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
      expect(updateArg?.data).toEqual({ amount: 90000 });
    });

    it('depositAmount alone (no lineItems) -> 200, amount left untouched', async () => {
      prismaMock.invoice.update.mockResolvedValue(invoice({ depositAmount: 10000 }) as never);
      const res = await PATCH(makePatch({ depositAmount: 10000 }), ctxWith('i-1'));
      expect(res.status).toBe(200);
      const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
      expect(updateArg?.data).toEqual({ depositAmount: 10000 });
      expect(updateArg?.data).not.toHaveProperty('amount');
    });

    it('depositAmount greater than the existing amount -> 400 VALIDATION_FAILED, no update', async () => {
      const res = await PATCH(makePatch({ depositAmount: 999999 }), ctxWith('i-1'));
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });

    it('depositAmount greater than a newly-provided lineItems total -> 400 VALIDATION_FAILED', async () => {
      const res = await PATCH(
        makePatch({
          lineItems: [{ designation: 'X', quantity: 1, unitPrice: 1000 }],
          depositAmount: 2000,
        }),
        ctxWith('i-1'),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });

    it('deliveryDate/paymentMethodNote/footerNote update independently', async () => {
      prismaMock.invoice.update.mockResolvedValue(invoice() as never);
      await PATCH(
        makePatch({
          deliveryDate: '2026-09-01T00:00:00.000Z',
          paymentMethodNote: 'Wave +221771234567',
          footerNote: 'Merci !',
        }),
        ctxWith('i-1'),
      );
      const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
      expect(updateArg?.data).toEqual({
        deliveryDate: new Date('2026-09-01T00:00:00.000Z'),
        paymentMethodNote: 'Wave +221771234567',
        footerNote: 'Merci !',
      });
    });

    it('depositAmount/deliveryDate/paymentMethodNote/footerNote against a QUOTE -> 400', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(invoice({ docType: 'QUOTE' }) as never);
      const res = await PATCH(makePatch({ depositAmount: 1000 }), ctxWith('i-1'));
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });
  });
});

describe('DELETE /api/invoices/[id]', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await DELETE(makeDelete({ csrf: 'missing' }), ctxWith('i-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.invoice.delete).not.toHaveBeenCalled();
  });

  it('invoice not owned by caller -> 404 INVOICE_NOT_FOUND', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null as never);
    const res = await DELETE(makeDelete(), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVOICE_NOT_FOUND');
  });

  it('non-DRAFT invoice -> 409 INVOICE_NOT_DRAFT, no delete', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoice({ status: 'SENT' }) as never);
    const res = await DELETE(makeDelete(), ctxWith('i-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVOICE_NOT_DRAFT');
    expect(prismaMock.invoice.delete).not.toHaveBeenCalled();
  });

  it('DRAFT invoice -> 200 { ok: true }, deletes the row', async () => {
    prismaMock.invoice.delete.mockResolvedValue(invoice() as never);
    const res = await DELETE(makeDelete(), ctxWith('i-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prismaMock.invoice.delete).toHaveBeenCalledWith({ where: { id: 'i-1' } });
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
