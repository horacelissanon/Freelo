// Freelance-side PDF download — ownership-scoped like GET /api/invoices/[id]
// (an invoice belonging to another user resolves as 404, not 403).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeGet(id: string): NextRequest {
  return new NextRequest(`http://test/api/invoices/${id}/pdf`);
}

const ownerRow = {
  documentIdentity: 'COMPANY',
  studioName: 'Atelier X',
  name: null,
  email: 'me@example.com',
  phone: null,
  bio: null,
  address: 'Dakar',
  taxId: null,
  commerceRegistry: null,
};

const invoiceRow = {
  id: 'i-1',
  number: '2026-001',
  docType: 'INVOICE',
  status: 'SENT',
  description: null,
  amount: 60000,
  currency: 'XOF',
  issueDate: new Date('2026-05-01T00:00:00Z'),
  dueDate: null,
  client: { name: 'Tekki Foods', email: null, phone: null, company: null },
  lineItems: [{ designation: 'Design', quantity: 1, unitPrice: 60000 }],
  packs: [],
  contentBlocks: [],
  paymentTermsNote: null,
  depositAmount: null,
  deliveryDate: null,
  paymentMethodNote: null,
  footerNote: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/invoices/[id]/pdf', () => {
  it('invoice not owned by caller -> 404', async () => {
    mockRequireAuth.mockResolvedValue(authedCtx as never);
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    const res = await GET(makeGet('i-1'), ctxWith('i-1'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVOICE_NOT_FOUND');
  });

  it('owned invoice -> 200 application/pdf with Content-Disposition attachment', async () => {
    mockRequireAuth.mockResolvedValue(authedCtx as never);
    prismaMock.invoice.findFirst.mockResolvedValue(invoiceRow as never);
    prismaMock.user.findUnique.mockResolvedValue(ownerRow as never);

    const res = await GET(makeGet('i-1'), ctxWith('i-1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="2026-001.pdf"');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
