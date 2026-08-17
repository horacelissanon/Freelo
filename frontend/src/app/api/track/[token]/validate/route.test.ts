// Public devis validation on the Client Link Portal — no auth, token IS the
// authorization. QUOTE only, SENT -> ACCEPTED, no other transition allowed.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST } from './route';

function ctxWith(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

function makePost(token: string, body?: unknown): NextRequest {
  return new NextRequest(`http://test/api/track/${token}/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function invoice(
  overrides: Partial<{ docType: string; status: string; publicPortalEnabled: boolean }> = {},
) {
  return {
    id: 'i-1',
    clientId: 'c-1',
    docType: overrides.docType ?? 'QUOTE',
    status: overrides.status ?? 'SENT',
    user: { publicPortalEnabled: overrides.publicPortalEnabled ?? true },
    packs: [
      { id: 'pack-1', items: [{ quantity: 1, unitPrice: 50000 }] },
      { id: 'pack-2', items: [{ quantity: 1, unitPrice: 120000 }] },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/track/[token]/validate', () => {
  it('SENT quote + valid packId -> 200, status ACCEPTED, amount reset to the chosen pack total', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice() as never);
    prismaMock.invoice.update.mockResolvedValue({
      id: 'i-1',
      status: 'ACCEPTED',
      selectedPackId: 'pack-2',
      amount: 120000,
    } as never);

    const res = await POST(makePost('tok-1', { packId: 'pack-2' }), ctxWith('tok-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ACCEPTED');
    expect(body.selectedPackId).toBe('pack-2');
    expect(body.amount).toBe(120000);

    const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'i-1' });
    expect(updateArg?.data).toEqual({
      status: 'ACCEPTED',
      selectedPackId: 'pack-2',
      amount: 120000,
    });

    // A newly-accepted devis promotes a brand-new client relationship to
    // "En attente" — only ever flips a 'new' client, never downgrades one
    // that's already 'active' (has a real project) or 'archived'.
    const clientUpdateArg = prismaMock.client.updateMany.mock.calls[0]?.[0];
    expect(clientUpdateArg?.where).toEqual({ id: 'c-1', status: 'new' });
    expect(clientUpdateArg?.data).toEqual({ status: 'pending' });
  });

  it('missing packId -> 400 VALIDATION_FAILED, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice() as never);
    const res = await POST(makePost('tok-1', {}), ctxWith('tok-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it("packId not among this quote's packs -> 404 PACK_NOT_FOUND, no update", async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice() as never);
    const res = await POST(makePost('tok-1', { packId: 'not-a-pack' }), ctxWith('tok-1'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PACK_NOT_FOUND');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('unknown token -> 404 NOT_FOUND, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(null);
    const res = await POST(
      makePost('does-not-exist', { packId: 'pack-1' }),
      ctxWith('does-not-exist'),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('DRAFT quote -> 404 NOT_FOUND (never share a link to an unsent draft)', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice({ status: 'DRAFT' }) as never);
    const res = await POST(makePost('tok-1', { packId: 'pack-1' }), ctxWith('tok-1'));
    expect(res.status).toBe(404);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('owner has publicPortalEnabled=false -> 404 NOT_FOUND, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(
      invoice({ publicPortalEnabled: false }) as never,
    );
    const res = await POST(makePost('tok-1', { packId: 'pack-1' }), ctxWith('tok-1'));
    expect(res.status).toBe(404);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('INVOICE docType -> 409 NOT_A_QUOTE, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice({ docType: 'INVOICE' }) as never);
    const res = await POST(makePost('tok-1', { packId: 'pack-1' }), ctxWith('tok-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NOT_A_QUOTE');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('already ACCEPTED -> 409 QUOTE_NOT_PENDING, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice({ status: 'ACCEPTED' }) as never);
    const res = await POST(makePost('tok-1', { packId: 'pack-1' }), ctxWith('tok-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('QUOTE_NOT_PENDING');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('CANCELED quote -> 409 QUOTE_NOT_PENDING, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice({ status: 'CANCELED' }) as never);
    const res = await POST(makePost('tok-1', { packId: 'pack-1' }), ctxWith('tok-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('QUOTE_NOT_PENDING');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs' and withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
