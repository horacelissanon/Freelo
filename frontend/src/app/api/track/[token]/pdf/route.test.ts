// Public PDF download by trackingToken — same anti-leak shape as
// GET /api/track/[token]: DRAFT, disabled public portal, or an unknown
// token all resolve as a plain 404, no distinct "not ready" error.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function ctxWith(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

const invoiceRow = {
  id: 'i-1',
  number: 'QT-2026-001',
  docType: 'QUOTE',
  status: 'SENT',
  description: null,
  amount: 200000,
  currency: 'XOF',
  issueDate: new Date('2026-05-01T00:00:00Z'),
  dueDate: null,
  client: { name: 'Tekki Foods', email: null, phone: null, company: null },
  user: {
    publicPortalEnabled: true,
    documentIdentity: 'COMPANY',
    studioName: 'Atelier X',
    name: null,
    email: 'atelier@example.com',
    phone: null,
    bio: null,
    address: null,
    taxId: null,
    commerceRegistry: null,
  },
  lineItems: [],
  packs: [
    {
      title: 'Essentiel',
      description: null,
      items: [{ designation: 'Logo', quantity: 1, unitPrice: 200000 }],
    },
  ],
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

describe('GET /api/track/[token]/pdf', () => {
  it('unknown token -> 404 NOT_FOUND', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet('http://test/api/track/nope/pdf'), ctxWith('nope'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_FOUND');
  });

  it('DRAFT quote -> 404 (never share a link to an unsent draft)', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      ...invoiceRow,
      status: 'DRAFT',
    } as never);
    const res = await GET(makeGet('http://test/api/track/tok-1/pdf'), ctxWith('tok-1'));
    expect(res.status).toBe(404);
  });

  it('owner disabled public portal -> 404', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      ...invoiceRow,
      user: { ...invoiceRow.user, publicPortalEnabled: false },
    } as never);
    const res = await GET(makeGet('http://test/api/track/tok-1/pdf'), ctxWith('tok-1'));
    expect(res.status).toBe(404);
  });

  it('SENT quote -> 200 application/pdf with Content-Disposition attachment', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow as never);
    const res = await GET(makeGet('http://test/api/track/tok-1/pdf'), ctxWith('tok-1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="QT-2026-001.pdf"');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
