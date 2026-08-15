// Public project/client-tracking endpoint — no auth, token IS the
// authorization. Handles two shapes: a Client.trackingToken (project list)
// and a Project.publicToken (rich detail with steps/comments/payments).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function ctxWith(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/track/[token] — client token', () => {
  it('valid client token -> 200 { kind: "client", projects }', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      name: 'Tekki Foods',
      user: { publicPortalEnabled: true },
      projects: [
        {
          id: 'p-1',
          name: 'Refonte site web',
          status: 'IN_PROGRESS',
          progress: 40,
          amount: 500000,
          currency: 'XOF',
          dueDate: null,
          step: null,
          publicToken: 'tok-project-1',
        },
      ],
    } as never);

    const res = await GET(makeGet('http://test/api/track/tok-client-1'), ctxWith('tok-client-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('client');
    expect(body.client.name).toBe('Tekki Foods');
    expect(body.projects).toHaveLength(1);

    const args = prismaMock.client.findUnique.mock.calls[0]?.[0];
    expect(args?.where?.trackingToken).toBe('tok-client-1');
  });

  it('owner has publicPortalEnabled=false -> 404 NOT_FOUND (same shape as an invalid token)', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      name: 'Tekki Foods',
      user: { publicPortalEnabled: false },
      projects: [],
    } as never);

    const res = await GET(makeGet('http://test/api/track/tok-client-1'), ctxWith('tok-client-1'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_FOUND');
  });
});

describe('GET /api/track/[token] — client token includes devis/factures', () => {
  it('client view includes non-DRAFT invoices, filtered at the query level', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      name: 'Tekki Foods',
      user: { publicPortalEnabled: true },
      projects: [],
      invoices: [
        {
          id: 'i-1',
          number: 'QT-2026-001',
          docType: 'QUOTE',
          status: 'SENT',
          amount: 200000,
          currency: 'XOF',
          trackingToken: 'tok-invoice-1',
        },
      ],
    } as never);

    const res = await GET(makeGet('http://test/api/track/tok-client-1'), ctxWith('tok-client-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0].trackingToken).toBe('tok-invoice-1');

    const args = prismaMock.client.findUnique.mock.calls[0]?.[0];
    const invoicesSelect = args?.select?.invoices as { where?: { status?: unknown } } | undefined;
    expect(invoicesSelect?.where?.status).toEqual({ not: 'DRAFT' });
  });
});

describe('GET /api/track/[token] — invoice/quote token', () => {
  it('DRAFT quote -> 404 NOT_FOUND (never share a link to an unsent draft)', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.project.findUnique.mockResolvedValue(null);
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'i-1',
      docType: 'QUOTE',
      status: 'DRAFT',
      user: { publicPortalEnabled: true, studioName: 'Atelier X', name: null, bio: null },
    } as never);

    const res = await GET(makeGet('http://test/api/track/tok-invoice-1'), ctxWith('tok-invoice-1'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_FOUND');
  });

  it('SENT quote -> 200 { kind: "quote" }, packs + contentBlocks + provider bio', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.project.findUnique.mockResolvedValue(null);
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'i-1',
      number: 'QT-2026-001',
      docType: 'QUOTE',
      status: 'SENT',
      description: null,
      amount: 200000,
      currency: 'XOF',
      issueDate: new Date('2026-05-01T00:00:00Z'),
      dueDate: null,
      client: { name: 'Tekki Foods' },
      user: {
        publicPortalEnabled: true,
        documentIdentity: 'COMPANY',
        studioName: 'Atelier X',
        name: null,
        email: 'atelier@example.com',
        phone: null,
        bio: 'Designer freelance.',
        address: null,
        taxId: null,
        commerceRegistry: null,
      },
      lineItems: [],
      packs: [
        {
          id: 'pack-1',
          title: 'Essentiel',
          description: null,
          items: [{ id: 'li-1', designation: 'Logo', quantity: 1, unitPrice: 200000 }],
        },
      ],
      contentBlocks: [
        { id: 'cb-1', kind: 'FAQ', primaryText: 'Délai ?', secondaryText: '2 semaines.' },
      ],
      paymentTermsNote: 'Acompte de 50%.',
      depositAmount: null,
      deliveryDate: null,
      paymentMethodNote: null,
      footerNote: null,
    } as never);

    const res = await GET(makeGet('http://test/api/track/tok-invoice-1'), ctxWith('tok-invoice-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('quote');
    expect(body.invoice.packs).toHaveLength(1);
    expect(body.invoice.contentBlocks).toHaveLength(1);
    expect(body.provider).toEqual({
      name: 'Atelier X',
      bio: 'Designer freelance.',
      phone: null,
      address: null,
      taxId: null,
      commerceRegistry: null,
    });
    expect(body.invoice.user).toBeUndefined();
  });

  it('SENT invoice -> 200 { kind: "invoice" }', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.project.findUnique.mockResolvedValue(null);
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'i-1',
      number: '2026-001',
      docType: 'INVOICE',
      status: 'SENT',
      description: null,
      amount: 60000,
      currency: 'XOF',
      issueDate: new Date('2026-05-01T00:00:00Z'),
      dueDate: null,
      client: { name: 'Tekki Foods' },
      user: { publicPortalEnabled: true, studioName: 'Atelier X', name: null, bio: null },
      lineItems: [{ id: 'li-1', designation: 'Service', quantity: 1, unitPrice: 60000 }],
      packs: [],
      contentBlocks: [],
      paymentTermsNote: null,
      depositAmount: null,
      deliveryDate: null,
      paymentMethodNote: null,
      footerNote: null,
    } as never);

    const res = await GET(makeGet('http://test/api/track/tok-invoice-1'), ctxWith('tok-invoice-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('invoice');
    expect(body.invoice.lineItems).toHaveLength(1);
  });

  it('owner has publicPortalEnabled=false -> 404 NOT_FOUND', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.project.findUnique.mockResolvedValue(null);
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'i-1',
      docType: 'QUOTE',
      status: 'SENT',
      user: { publicPortalEnabled: false, studioName: null, name: null, bio: null },
    } as never);

    const res = await GET(makeGet('http://test/api/track/tok-invoice-1'), ctxWith('tok-invoice-1'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/track/[token] — project token', () => {
  it('valid project token -> 200 { kind: "project" } with deposit/balance derived from paid orders', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'p-1',
      name: 'Refonte site web',
      status: 'IN_PROGRESS',
      progress: 40,
      amount: 500000,
      currency: 'XOF',
      dueDate: null,
      step: null,
      depositPercent: 30,
      createdAt: new Date('2026-05-01T00:00:00Z'),
      client: { name: 'Tekki Foods' },
      user: { publicPortalEnabled: true },
      steps: [{ id: 's-1', order: 1, title: 'Brief', status: 'COMPLETED' }],
      comments: [{ id: 'c-1', author: 'CLIENT', body: 'Merci !', createdAt: new Date() }],
    } as never);
    prismaMock.order.findMany.mockResolvedValue([
      { metadata: { projectId: 'p-1', docType: 'DEPOSIT' } },
    ] as never);

    const res = await GET(makeGet('http://test/api/track/tok-project-1'), ctxWith('tok-project-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('project');
    expect(body.project.client.name).toBe('Tekki Foods');
    expect(body.project.userId).toBeUndefined();
    expect(body.deposit).toEqual({ amount: 150000, paid: true });
    expect(body.balance).toEqual({ amount: 350000, paid: false });
    expect(body.steps).toHaveLength(1);
    expect(body.comments).toHaveLength(1);

    const orderArgs = prismaMock.order.findMany.mock.calls[0]?.[0];
    expect(orderArgs?.where?.status).toBe('PAID');
  });

  it('unknown token (neither client, project, nor invoice) -> 404 NOT_FOUND', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.project.findUnique.mockResolvedValue(null);
    prismaMock.invoice.findUnique.mockResolvedValue(null);
    const res = await GET(
      makeGet('http://test/api/track/does-not-exist'),
      ctxWith('does-not-exist'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('NOT_FOUND');
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs' and withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
