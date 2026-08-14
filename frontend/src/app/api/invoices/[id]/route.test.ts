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
import { GET, PATCH } from './route';

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

function invoice(overrides: Partial<{ docType: string; status: string }> = {}) {
  return {
    id: 'i-1',
    userId: 'user-1',
    clientId: 'c-1',
    projectId: null,
    docType: overrides.docType ?? 'INVOICE',
    number: '2026-001',
    description: null,
    amount: 60000,
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
