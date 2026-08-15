// Phase A freelance CRM — /api/invoices GET (cursor list) + POST (create,
// sequential number generation).
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
  return new NextRequest('http://test/api/invoices', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function oneLineItem(unitPrice: number) {
  return [{ designation: 'Service', quantity: 1, unitPrice }];
}

function onePack(unitPrice: number) {
  return [{ title: 'Offre standard', items: oneLineItem(unitPrice) }];
}

function invoice(overrides: Partial<{ id: string; number: string }> = {}) {
  return {
    id: overrides.id ?? 'i-1',
    userId: 'user-1',
    clientId: 'c-1',
    projectId: null,
    docType: 'INVOICE',
    number: overrides.number ?? '2026-001',
    description: null,
    amount: 60000,
    currency: 'XOF',
    status: 'DRAFT',
    issueDate: new Date('2026-05-01T00:00:00Z'),
    dueDate: null,
    orderId: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' } as never);
  prismaMock.project.findFirst.mockResolvedValue({ id: 'p-1' } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/invoices', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/invoices'));
    expect(res.status).toBe(401);
  });

  it('?docType and ?status filter the where clause, scoped by userId', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/invoices?docType=QUOTE&status=SENT'));
    const args = prismaMock.invoice.findMany.mock.calls[0]?.[0];
    expect(args?.where?.userId).toBe('user-1');
    expect(args?.where?.docType).toBe('QUOTE');
    expect(args?.where?.status).toBe('SENT');
  });
});

describe('POST /api/invoices', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await POST(
      makePost({ clientId: 'c-1', docType: 'INVOICE', amount: 1000 }, { csrf: 'missing' }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('invalid body (missing docType) -> 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ clientId: 'c-1', amount: 1000 }));
    expect(res.status).toBe(400);
  });

  it('clientId not owned -> 404 CLIENT_NOT_FOUND', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null as never);
    const res = await POST(
      makePost({ clientId: 'x', docType: 'INVOICE', lineItems: oneLineItem(1000) }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('projectId not owned -> 404 PROJECT_NOT_FOUND', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await POST(
      makePost({
        clientId: 'c-1',
        projectId: 'someone-elses',
        docType: 'INVOICE',
        lineItems: oneLineItem(1000),
      }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('null projectId/description/dueDate on create -> 201, fields omitted (not rejected)', async () => {
    // Regression: the create forms send explicit `null` for a blank
    // optional field (same shared-payload shape as their PATCH branch),
    // not `undefined` — a bare .optional() schema rejects null outright.
    prismaMock.invoice.count.mockResolvedValue(0 as never);
    prismaMock.invoice.create.mockResolvedValue(invoice() as never);
    const res = await POST(
      makePost({
        clientId: 'c-1',
        docType: 'INVOICE',
        lineItems: oneLineItem(1000),
        projectId: null,
        description: null,
        dueDate: null,
        depositAmount: null,
        deliveryDate: null,
        paymentMethodNote: null,
        footerNote: null,
      }),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
    expect(createArg?.data).not.toHaveProperty('projectId');
    expect(createArg?.data).not.toHaveProperty('description');
    expect(createArg?.data).not.toHaveProperty('dueDate');
    expect(createArg?.data).not.toHaveProperty('deliveryDate');
    expect(createArg?.data).not.toHaveProperty('paymentMethodNote');
    expect(createArg?.data).not.toHaveProperty('footerNote');
  });

  it('null paymentTermsNote on a QUOTE create -> 201, field omitted', async () => {
    prismaMock.invoice.count.mockResolvedValue(0 as never);
    prismaMock.invoice.create.mockResolvedValue(invoice({ number: 'QT-2026-001' }) as never);
    prismaMock.invoicePack.create.mockResolvedValue({ id: 'pack-1' } as never);
    const res = await POST(
      makePost({
        clientId: 'c-1',
        docType: 'QUOTE',
        packs: onePack(50000),
        projectId: null,
        description: null,
        dueDate: null,
        paymentTermsNote: null,
      }),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
    expect(createArg?.data).not.toHaveProperty('projectId');
    expect(createArg?.data).not.toHaveProperty('paymentTermsNote');
  });

  it('INVOICE with count=0 -> number "{year}-001"', async () => {
    const year = new Date().getFullYear();
    prismaMock.invoice.count.mockResolvedValue(0 as never);
    prismaMock.invoice.create.mockResolvedValue(invoice({ number: `${year}-001` }) as never);
    const res = await POST(
      makePost({ clientId: 'c-1', docType: 'INVOICE', lineItems: oneLineItem(60000) }),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
    expect(createArg?.data?.number).toBe(`${year}-001`);
    expect(createArg?.data?.userId).toBe('user-1');
  });

  it('QUOTE with count=7 -> number "QT-{year}-008"', async () => {
    const year = new Date().getFullYear();
    prismaMock.invoice.count.mockResolvedValue(7 as never);
    prismaMock.invoice.create.mockResolvedValue(invoice({ number: `QT-${year}-008` }) as never);
    prismaMock.invoicePack.create.mockResolvedValue({ id: 'pack-1' } as never);
    const res = await POST(makePost({ clientId: 'c-1', docType: 'QUOTE', packs: onePack(85000) }));
    expect(res.status).toBe(201);
    const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
    expect(createArg?.data?.number).toBe(`QT-${year}-008`);
    expect(createArg?.data?.docType).toBe('QUOTE');
  });

  it('P2002 unique conflict retries with a higher sequence, then succeeds', async () => {
    prismaMock.invoice.count.mockResolvedValue(0 as never);
    const conflict = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    prismaMock.invoice.create
      .mockRejectedValueOnce(conflict as never)
      .mockResolvedValueOnce(invoice() as never);
    const res = await POST(
      makePost({ clientId: 'c-1', docType: 'INVOICE', lineItems: oneLineItem(60000) }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(2);
  });

  it('P2002 conflict on every retry -> 409 NUMBER_GENERATION_FAILED', async () => {
    prismaMock.invoice.count.mockResolvedValue(0 as never);
    const conflict = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    prismaMock.invoice.create.mockRejectedValue(conflict as never);
    const res = await POST(
      makePost({ clientId: 'c-1', docType: 'INVOICE', lineItems: oneLineItem(60000) }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NUMBER_GENERATION_FAILED');
  });

  describe('line items (INVOICE) / packs (QUOTE)', () => {
    it('INVOICE without lineItems -> 400 VALIDATION_FAILED', async () => {
      const res = await POST(makePost({ clientId: 'c-1', docType: 'INVOICE' }));
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('INVOICE with lineItems -> amount is computed server-side, sequential order', async () => {
      prismaMock.invoice.count.mockResolvedValue(0 as never);
      prismaMock.invoice.create.mockResolvedValue(invoice({ number: '2026-001' }) as never);
      const res = await POST(
        makePost({
          clientId: 'c-1',
          docType: 'INVOICE',
          lineItems: [
            { designation: 'Logo', quantity: 1, unitPrice: 100000 },
            { designation: 'Charte graphique', quantity: 2, unitPrice: 25000 },
          ],
        }),
      );
      expect(res.status).toBe(201);
      const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
      expect(createArg?.data?.amount).toBe(150000);
      expect(createArg?.data?.lineItems?.create).toEqual([
        expect.objectContaining({ order: 1, designation: 'Logo', quantity: 1, unitPrice: 100000 }),
        expect.objectContaining({
          order: 2,
          designation: 'Charte graphique',
          quantity: 2,
          unitPrice: 25000,
        }),
      ]);
    });

    it('a stray amount on an INVOICE create is ignored in favor of the computed total', async () => {
      prismaMock.invoice.count.mockResolvedValue(0 as never);
      prismaMock.invoice.create.mockResolvedValue(invoice() as never);
      await POST(
        makePost({
          clientId: 'c-1',
          docType: 'INVOICE',
          amount: 999999,
          lineItems: oneLineItem(1000),
        }),
      );
      const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
      expect(createArg?.data?.amount).toBe(1000);
    });

    it('QUOTE without packs -> 400 VALIDATION_FAILED', async () => {
      const res = await POST(makePost({ clientId: 'c-1', docType: 'QUOTE' }));
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('QUOTE with lineItems instead of packs -> 400 VALIDATION_FAILED', async () => {
      const res = await POST(
        makePost({
          clientId: 'c-1',
          docType: 'QUOTE',
          lineItems: oneLineItem(1000),
        }),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('QUOTE with an invoice-only field (depositAmount) -> 400 VALIDATION_FAILED', async () => {
      const res = await POST(
        makePost({
          clientId: 'c-1',
          docType: 'QUOTE',
          packs: onePack(1000),
          depositAmount: 500,
        }),
      );
      expect(res.status).toBe(400);
    });

    it('QUOTE with packs -> amount is computed server-side across all packs, invoice created inside a transaction', async () => {
      prismaMock.invoice.count.mockResolvedValue(0 as never);
      prismaMock.invoice.create.mockResolvedValue(invoice({ number: 'QT-2026-001' }) as never);
      prismaMock.invoicePack.create.mockResolvedValue({ id: 'pack-1' } as never);
      const res = await POST(
        makePost({
          clientId: 'c-1',
          docType: 'QUOTE',
          packs: [
            { title: 'Essentiel', items: [{ designation: 'Logo', quantity: 1, unitPrice: 50000 }] },
            {
              title: 'Premium',
              items: [
                { designation: 'Logo', quantity: 1, unitPrice: 50000 },
                { designation: 'Charte graphique', quantity: 1, unitPrice: 30000 },
              ],
            },
          ],
        }),
      );
      expect(res.status).toBe(201);
      const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
      // computeQuoteTotal sums every pack's items, not just the first —
      // guards against a regression that only totals pack[0].
      expect(createArg?.data?.amount).toBe(130000);
      expect(prismaMock.invoicePack.create).toHaveBeenCalledTimes(2);
      const firstPackArg = prismaMock.invoicePack.create.mock.calls[0]?.[0];
      expect(firstPackArg?.data?.title).toBe('Essentiel');
      expect(firstPackArg?.data?.items?.create).toEqual([
        expect.objectContaining({
          invoiceId: 'i-1',
          order: 1,
          designation: 'Logo',
          quantity: 1,
          unitPrice: 50000,
        }),
      ]);
    });

    it('INVOICE with contentBlocks -> 400 VALIDATION_FAILED (quote-only field)', async () => {
      const res = await POST(
        makePost({
          clientId: 'c-1',
          docType: 'INVOICE',
          lineItems: oneLineItem(1000),
          contentBlocks: [{ kind: 'FAQ', primaryText: 'Question ?', secondaryText: 'Réponse.' }],
        }),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('INVOICE with paymentTermsNote -> 400 VALIDATION_FAILED (quote-only field)', async () => {
      const res = await POST(
        makePost({
          clientId: 'c-1',
          docType: 'INVOICE',
          lineItems: oneLineItem(1000),
          paymentTermsNote: 'Un acompte de 50% est demandé.',
        }),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('QUOTE with contentBlocks -> createMany with per-kind sequential order, paymentTermsNote persisted', async () => {
      prismaMock.invoice.count.mockResolvedValue(0 as never);
      prismaMock.invoice.create.mockResolvedValue(invoice({ number: 'QT-2026-001' }) as never);
      prismaMock.invoicePack.create.mockResolvedValue({ id: 'pack-1' } as never);
      const res = await POST(
        makePost({
          clientId: 'c-1',
          docType: 'QUOTE',
          packs: onePack(50000),
          paymentTermsNote: 'Un acompte de 50% est demandé avant le démarrage.',
          contentBlocks: [
            { kind: 'PROCESS', primaryText: 'Brief', secondaryText: 'On cadre le besoin.' },
            { kind: 'PROCESS', primaryText: 'Livraison' },
            { kind: 'FAQ', primaryText: 'Combien de temps ?', secondaryText: '2 semaines.' },
          ],
        }),
      );
      expect(res.status).toBe(201);
      const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
      expect(createArg?.data?.paymentTermsNote).toBe(
        'Un acompte de 50% est demandé avant le démarrage.',
      );
      expect(prismaMock.quoteContentBlock.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            invoiceId: 'i-1',
            kind: 'PROCESS',
            order: 1,
            primaryText: 'Brief',
            secondaryText: 'On cadre le besoin.',
          }),
          expect.objectContaining({
            invoiceId: 'i-1',
            kind: 'PROCESS',
            order: 2,
            primaryText: 'Livraison',
          }),
          expect.objectContaining({
            invoiceId: 'i-1',
            kind: 'FAQ',
            order: 1,
            primaryText: 'Combien de temps ?',
          }),
        ],
      });
    });

    it('depositAmount greater than the computed total -> 400 VALIDATION_FAILED', async () => {
      const res = await POST(
        makePost({
          clientId: 'c-1',
          docType: 'INVOICE',
          lineItems: oneLineItem(1000),
          depositAmount: 5000,
        }),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('INVOICE with depositAmount/deliveryDate/paymentMethodNote/footerNote persists them', async () => {
      prismaMock.invoice.count.mockResolvedValue(0 as never);
      prismaMock.invoice.create.mockResolvedValue(invoice() as never);
      await POST(
        makePost({
          clientId: 'c-1',
          docType: 'INVOICE',
          lineItems: oneLineItem(10000),
          depositAmount: 3000,
          deliveryDate: '2026-09-01T00:00:00.000Z',
          paymentMethodNote: 'Orange Money +221771234567',
          footerNote: 'Merci pour votre confiance !',
        }),
      );
      const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
      expect(createArg?.data?.depositAmount).toBe(3000);
      expect(createArg?.data?.paymentMethodNote).toBe('Orange Money +221771234567');
      expect(createArg?.data?.footerNote).toBe('Merci pour votre confiance !');
    });
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs' and withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
