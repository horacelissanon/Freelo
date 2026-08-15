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

function makePost(token: string): NextRequest {
  return new NextRequest(`http://test/api/track/${token}/validate`, { method: 'POST' });
}

function invoice(
  overrides: Partial<{ docType: string; status: string; publicPortalEnabled: boolean }> = {},
) {
  return {
    id: 'i-1',
    docType: overrides.docType ?? 'QUOTE',
    status: overrides.status ?? 'SENT',
    user: { publicPortalEnabled: overrides.publicPortalEnabled ?? true },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/track/[token]/validate', () => {
  it('SENT quote -> 200, status flips to ACCEPTED', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice() as never);
    prismaMock.invoice.update.mockResolvedValue({ id: 'i-1', status: 'ACCEPTED' } as never);

    const res = await POST(makePost('tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ACCEPTED');

    const updateArg = prismaMock.invoice.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'i-1' });
    expect(updateArg?.data).toEqual({ status: 'ACCEPTED' });
  });

  it('unknown token -> 404 NOT_FOUND, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(null);
    const res = await POST(makePost('does-not-exist'), ctxWith('does-not-exist'));
    expect(res.status).toBe(404);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('DRAFT quote -> 404 NOT_FOUND (never share a link to an unsent draft)', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice({ status: 'DRAFT' }) as never);
    const res = await POST(makePost('tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(404);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('owner has publicPortalEnabled=false -> 404 NOT_FOUND, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(
      invoice({ publicPortalEnabled: false }) as never,
    );
    const res = await POST(makePost('tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(404);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('INVOICE docType -> 409 NOT_A_QUOTE, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice({ docType: 'INVOICE' }) as never);
    const res = await POST(makePost('tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NOT_A_QUOTE');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('already ACCEPTED -> 409 QUOTE_NOT_PENDING, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice({ status: 'ACCEPTED' }) as never);
    const res = await POST(makePost('tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('QUOTE_NOT_PENDING');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('CANCELED quote -> 409 QUOTE_NOT_PENDING, no update', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice({ status: 'CANCELED' }) as never);
    const res = await POST(makePost('tok-1'), ctxWith('tok-1'));
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
