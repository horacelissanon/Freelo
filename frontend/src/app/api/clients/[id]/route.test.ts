// GET: ownership-scoped single-client detail (projects/invoices). PATCH:
// freelancer-side edits (contact fields) + status transitions (archive/
// reactivate) — partial update, only touches provided keys.
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
  return new NextRequest(`http://test/api/clients/${id}`);
}

function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/clients/c-1', {
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
  return new NextRequest('http://test/api/clients/c-1', { method: 'DELETE', headers });
}

const baseClient = {
  id: 'c-1',
  userId: 'user-1',
  code: 'CL-0001',
  name: 'Bakeli Studio',
  contactName: 'Fatoumata Diallo',
  email: 'fatoumata@bakeli.sn',
  phone: '+221771234567',
  company: null,
  website: null,
  city: null,
  sector: null,
  notes: null,
  status: 'active',
  imageUrl: null,
  trackingToken: 'ct-1',
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-01T00:00:00Z'),
  projects: [],
  invoices: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.client.findFirst.mockResolvedValue(baseClient as never);
});

describe('GET /api/clients/[id]', () => {
  it('client not owned by caller -> 404 CLIENT_NOT_FOUND', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null as never);
    const res = await GET(makeGet('someone-elses'), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
  });

  it('returns client with projects and invoices', async () => {
    const res = await GET(makeGet('c-1'), ctxWith('c-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('c-1');
    expect(body.projects).toEqual([]);
  });
});

describe('PATCH /api/clients/[id]', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await PATCH(makePatch({ name: 'New name' }, { csrf: 'missing' }), ctxWith('c-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it('client not owned by caller -> 404 CLIENT_NOT_FOUND', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null as never);
    const res = await PATCH(makePatch({ name: 'New name' }), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
  });

  it('invalid status -> 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({ status: 'deleted' }), ctxWith('c-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it('partial update only touches provided fields', async () => {
    prismaMock.client.update.mockResolvedValue(baseClient as never);
    const res = await PATCH(makePatch({ company: 'Tekki Foods' }), ctxWith('c-1'));
    expect(res.status).toBe(200);
    const updateArg = prismaMock.client.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ company: 'Tekki Foods' });
  });

  it('nullable field cleared with null', async () => {
    prismaMock.client.update.mockResolvedValue(baseClient as never);
    await PATCH(makePatch({ notes: null }), ctxWith('c-1'));
    const updateArg = prismaMock.client.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ notes: null });
  });

  it('status: archived archives the client', async () => {
    prismaMock.client.update.mockResolvedValue({ ...baseClient, status: 'archived' } as never);
    const res = await PATCH(makePatch({ status: 'archived' }), ctxWith('c-1'));
    expect(res.status).toBe(200);
    const updateArg = prismaMock.client.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ status: 'archived' });
    expect((await res.json()).status).toBe('archived');
  });

  it('un-archiving (any non-archived status sent) recomputes the real status live instead of trusting the literal value', async () => {
    prismaMock.project.count.mockResolvedValue(0 as never);
    prismaMock.invoice.count.mockResolvedValue(1 as never);
    prismaMock.client.update.mockResolvedValue({ ...baseClient, status: 'pending' } as never);
    const res = await PATCH(makePatch({ status: 'active' }), ctxWith('c-1'));
    expect(res.status).toBe(200);
    const updateArg = prismaMock.client.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ status: 'pending' });
  });
});

describe('DELETE /api/clients/[id]', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await DELETE(makeDelete({ csrf: 'missing' }), ctxWith('c-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.client.delete).not.toHaveBeenCalled();
  });

  it('client not owned by caller -> 404 CLIENT_NOT_FOUND', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null as never);
    const res = await DELETE(makeDelete(), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
  });

  it('client has projects or invoices -> 409 CLIENT_HAS_LINKED_RECORDS, no delete', async () => {
    prismaMock.client.findFirst.mockResolvedValue({
      id: 'c-1',
      _count: { projects: 1, invoices: 0 },
    } as never);
    const res = await DELETE(makeDelete(), ctxWith('c-1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CLIENT_HAS_LINKED_RECORDS');
    expect(prismaMock.client.delete).not.toHaveBeenCalled();
  });

  it('client with zero linked records -> 200, deletes', async () => {
    prismaMock.client.findFirst.mockResolvedValue({
      id: 'c-1',
      _count: { projects: 0, invoices: 0 },
    } as never);
    prismaMock.client.delete.mockResolvedValue(baseClient as never);
    const res = await DELETE(makeDelete(), ctxWith('c-1'));
    expect(res.status).toBe(200);
    expect(prismaMock.client.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
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
