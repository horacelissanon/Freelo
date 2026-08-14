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
    const res = await POST(makePost({ clientId: 'x', docType: 'INVOICE', amount: 1000 }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('projectId not owned -> 404 PROJECT_NOT_FOUND', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await POST(
      makePost({ clientId: 'c-1', projectId: 'someone-elses', docType: 'INVOICE', amount: 1000 }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('INVOICE with count=0 -> number "{year}-001"', async () => {
    const year = new Date().getFullYear();
    prismaMock.invoice.count.mockResolvedValue(0 as never);
    prismaMock.invoice.create.mockResolvedValue(invoice({ number: `${year}-001` }) as never);
    const res = await POST(makePost({ clientId: 'c-1', docType: 'INVOICE', amount: 60000 }));
    expect(res.status).toBe(201);
    const createArg = prismaMock.invoice.create.mock.calls[0]?.[0];
    expect(createArg?.data?.number).toBe(`${year}-001`);
    expect(createArg?.data?.userId).toBe('user-1');
  });

  it('QUOTE with count=7 -> number "QT-{year}-008"', async () => {
    const year = new Date().getFullYear();
    prismaMock.invoice.count.mockResolvedValue(7 as never);
    prismaMock.invoice.create.mockResolvedValue(invoice({ number: `QT-${year}-008` }) as never);
    const res = await POST(makePost({ clientId: 'c-1', docType: 'QUOTE', amount: 85000 }));
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
    const res = await POST(makePost({ clientId: 'c-1', docType: 'INVOICE', amount: 60000 }));
    expect(res.status).toBe(201);
    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(2);
  });

  it('P2002 conflict on every retry -> 409 NUMBER_GENERATION_FAILED', async () => {
    prismaMock.invoice.count.mockResolvedValue(0 as never);
    const conflict = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    prismaMock.invoice.create.mockRejectedValue(conflict as never);
    const res = await POST(makePost({ clientId: 'c-1', docType: 'INVOICE', amount: 60000 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NUMBER_GENERATION_FAILED');
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs' and withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
