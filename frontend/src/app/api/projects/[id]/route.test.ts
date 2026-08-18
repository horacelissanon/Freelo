// GET: ownership-scoped single-project detail (steps/comments/invoices/files
// + deposit/balance derivation). PATCH: freelancer-side edits (name/type/
// description/amount/dueDate) — partial update, only touches provided keys.
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
  return new NextRequest(`http://test/api/projects/${id}`);
}

function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/projects/p-1', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

const baseProject = {
  id: 'p-1',
  userId: 'user-1',
  clientId: 'c-1',
  name: 'Site vitrine',
  type: 'UI_WEB',
  description: null,
  status: 'IN_PROGRESS',
  progress: 40,
  amount: 100000,
  currency: 'XOF',
  dueDate: null,
  step: null,
  publicToken: 'tok-1',
  depositType: 'PERCENT',
  depositValue: 30,
  createdAt: new Date(),
  updatedAt: new Date(),
  client: { id: 'c-1', name: 'Baobab Tech', trackingToken: 'ct-1' },
  steps: [],
  comments: [],
  invoices: [],
  files: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.project.findFirst.mockResolvedValue(baseProject as never);
  prismaMock.order.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/projects/[id]', () => {
  it('project not owned by caller -> 404 PROJECT_NOT_FOUND', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await GET(makeGet('someone-elses'), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
  });

  it('returns project, steps, comments, invoices, files and deposit/balance', async () => {
    const res = await GET(makeGet('p-1'), ctxWith('p-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.id).toBe('p-1');
    expect(body.project.type).toBe('UI_WEB');
    expect(body.files).toEqual([]);
    expect(body.deposit).toEqual({ amount: 30000, paid: false });
    expect(body.balance).toEqual({ amount: 70000, paid: false });
  });

  it('a partial acompte actually paid shows the real amount, not the 30% estimate', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { amount: 15000, metadata: { projectId: 'p-1', docType: 'DEPOSIT' } },
    ] as never);
    const res = await GET(makeGet('p-1'), ctxWith('p-1'));
    const body = await res.json();
    expect(body.deposit).toEqual({ amount: 15000, paid: true });
    expect(body.balance).toEqual({ amount: 85000, paid: false });
  });
});

describe('PATCH /api/projects/[id]', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await PATCH(makePatch({ name: 'New name' }, { csrf: 'missing' }), ctxWith('p-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it('project not owned by caller -> 404 PROJECT_NOT_FOUND', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await PATCH(makePatch({ name: 'New name' }), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
  });

  it('invalid body -> 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({ type: 'NOT_A_TYPE' }), ctxWith('p-1'));
    expect(res.status).toBe(400);
  });

  it('partial update only touches provided fields', async () => {
    prismaMock.project.update.mockResolvedValue(baseProject as never);
    const res = await PATCH(makePatch({ amount: 250000 }), ctxWith('p-1'));
    expect(res.status).toBe(200);
    const updateArg = prismaMock.project.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ amount: 250000 });
  });

  it('dueDate: null clears the date', async () => {
    prismaMock.project.update.mockResolvedValue(baseProject as never);
    await PATCH(makePatch({ dueDate: null }), ctxWith('p-1'));
    const updateArg = prismaMock.project.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ dueDate: null });
  });

  it('accepts name, type, description, amount and dueDate together', async () => {
    prismaMock.project.update.mockResolvedValue(baseProject as never);
    await PATCH(
      makePatch({
        name: 'Nouveau nom',
        type: 'LOGO',
        description: 'Brief court',
        amount: 90000,
        dueDate: '2026-09-01T00:00:00.000Z',
      }),
      ctxWith('p-1'),
    );
    const updateArg = prismaMock.project.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({
      name: 'Nouveau nom',
      type: 'LOGO',
      description: 'Brief court',
      amount: 90000,
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
    });
  });

  it('status: DELIVERED is not a valid target value -> 400, never reaches the update', async () => {
    const res = await PATCH(makePatch({ status: 'DELIVERED' }), ctxWith('p-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it('status: PENDING on a non-DRAFT project -> 409, never reaches the update', async () => {
    const res = await PATCH(makePatch({ status: 'PENDING' }), ctxWith('p-1'));
    expect(res.status).toBe(409);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it('currency changed to non-default without a rate on a DRAFT project -> 400 VALIDATION_FAILED', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ ...baseProject, status: 'DRAFT' } as never);
    prismaMock.user.findUnique.mockResolvedValue({ defaultCurrency: 'XOF' } as never);
    const res = await PATCH(makePatch({ currency: 'EUR' }), ctxWith('p-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it('currency changed to non-default with a rate on a DRAFT project -> 200, stores the rate', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ ...baseProject, status: 'DRAFT' } as never);
    prismaMock.user.findUnique.mockResolvedValue({ defaultCurrency: 'XOF' } as never);
    prismaMock.project.update.mockResolvedValue(baseProject as never);
    const res = await PATCH(
      makePatch({ currency: 'EUR', exchangeRateToDefault: 655.957 }),
      ctxWith('p-1'),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.project.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ currency: 'EUR', exchangeRateToDefault: 655.957 });
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
