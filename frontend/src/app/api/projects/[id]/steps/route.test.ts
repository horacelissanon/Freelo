// POST /api/projects/[id]/steps — appends a custom step to a project's
// checklist. Pattern mirrors [stepId]/route.test.ts.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/projects/p-1/steps', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.project.findFirst.mockResolvedValue({ id: 'p-1' } as never);
});

describe('POST /api/projects/[id]/steps', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await POST(makePost({ title: 'Brief' }, { csrf: 'missing' }), ctxWith('p-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.projectStep.create).not.toHaveBeenCalled();
  });

  it('project not owned by caller -> 404 PROJECT_NOT_FOUND', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await POST(makePost({ title: 'Brief' }), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
  });

  it('empty title -> 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ title: '' }), ctxWith('p-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.projectStep.create).not.toHaveBeenCalled();
  });

  it('valid body -> 201, order = existing count + 1', async () => {
    prismaMock.projectStep.count.mockResolvedValue(3 as never);
    prismaMock.projectStep.create.mockResolvedValue({
      id: 's-4',
      projectId: 'p-1',
      order: 4,
      title: 'Livraison',
      description: null,
      status: 'PENDING',
      completedAt: null,
    } as never);
    const res = await POST(makePost({ title: 'Livraison' }), ctxWith('p-1'));
    expect(res.status).toBe(201);
    const createArg = prismaMock.projectStep.create.mock.calls[0]?.[0];
    expect(createArg?.data?.order).toBe(4);
    expect(createArg?.data?.title).toBe('Livraison');
    expect(createArg?.data).not.toHaveProperty('description');
  });

  it('optional description is passed through when provided', async () => {
    prismaMock.projectStep.count.mockResolvedValue(0 as never);
    prismaMock.projectStep.create.mockResolvedValue({ id: 's-1' } as never);
    await POST(makePost({ title: 'Brief', description: 'Collecte des besoins' }), ctxWith('p-1'));
    const createArg = prismaMock.projectStep.create.mock.calls[0]?.[0];
    expect(createArg?.data?.description).toBe('Collecte des besoins');
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
