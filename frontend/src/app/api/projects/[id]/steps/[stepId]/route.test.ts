// Freelancer-side step management: `status` flips PENDING/IN_PROGRESS/
// COMPLETED (stamping/clearing completedAt), `move` swaps `order` with the
// adjacent sibling and is a no-op — not an error — at either boundary.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { PATCH, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function ctxWith(id: string, stepId: string): { params: Promise<{ id: string; stepId: string }> } {
  return { params: Promise.resolve({ id, stepId }) };
}

function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/projects/p-1/steps/s-2', {
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
  return new NextRequest('http://test/api/projects/p-1/steps/s-2', {
    method: 'DELETE',
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.project.findFirst.mockResolvedValue({ id: 'p-1' } as never);
  // Default: a single still-pending step, so action=status tests that don't
  // care about the resulting progress% don't need to stub this themselves.
  prismaMock.projectStep.findMany.mockResolvedValue([{ status: 'PENDING' }] as never);
});

describe('PATCH /api/projects/[id]/steps/[stepId]', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await PATCH(
      makePatch({ action: 'status', status: 'COMPLETED' }, { csrf: 'missing' }),
      ctxWith('p-1', 's-2'),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.projectStep.update).not.toHaveBeenCalled();
  });

  it('project not owned by caller -> 404 PROJECT_NOT_FOUND', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await PATCH(
      makePatch({ action: 'status', status: 'COMPLETED' }),
      ctxWith('someone-elses', 's-2'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
  });

  it('invalid body -> 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(
      makePatch({ action: 'status', status: 'BOGUS' }),
      ctxWith('p-1', 's-2'),
    );
    expect(res.status).toBe(400);
  });

  it('step not found on this project -> 404 STEP_NOT_FOUND', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue(null as never);
    const res = await PATCH(
      makePatch({ action: 'status', status: 'COMPLETED' }),
      ctxWith('p-1', 'not-a-step'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('STEP_NOT_FOUND');
  });

  it('action=status COMPLETED -> stamps completedAt', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue({ id: 's-2', order: 2 } as never);
    const res = await PATCH(
      makePatch({ action: 'status', status: 'COMPLETED' }),
      ctxWith('p-1', 's-2'),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.projectStep.update.mock.calls[0]?.[0];
    expect(updateArg?.data?.status).toBe('COMPLETED');
    expect(updateArg?.data?.completedAt).toBeInstanceOf(Date);
  });

  it('action=status PENDING -> clears completedAt', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue({ id: 's-2', order: 2 } as never);
    await PATCH(makePatch({ action: 'status', status: 'PENDING' }), ctxWith('p-1', 's-2'));
    const updateArg = prismaMock.projectStep.update.mock.calls[0]?.[0];
    expect(updateArg?.data?.completedAt).toBeNull();
  });

  it('action=status recomputes the project progress from all steps', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue({ id: 's-2', order: 2 } as never);
    prismaMock.projectStep.findMany.mockResolvedValue([
      { status: 'COMPLETED' },
      { status: 'COMPLETED' },
      { status: 'PENDING' },
      { status: 'PENDING' },
    ] as never);
    await PATCH(makePatch({ action: 'status', status: 'COMPLETED' }), ctxWith('p-1', 's-2'));
    const projectUpdateArg = prismaMock.project.update.mock.calls[0]?.[0];
    expect(projectUpdateArg?.where).toEqual({ id: 'p-1' });
    expect(projectUpdateArg?.data?.progress).toBe(50);
    expect(projectUpdateArg?.data?.status).toBeUndefined();
  });

  it('action=status reaching 100% -> project status auto-flips to DELIVERED', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue({ id: 's-2', order: 2 } as never);
    prismaMock.projectStep.findMany.mockResolvedValue([
      { status: 'COMPLETED' },
      { status: 'COMPLETED' },
    ] as never);
    await PATCH(makePatch({ action: 'status', status: 'COMPLETED' }), ctxWith('p-1', 's-2'));
    const projectUpdateArg = prismaMock.project.update.mock.calls[0]?.[0];
    expect(projectUpdateArg?.data?.progress).toBe(100);
    expect(projectUpdateArg?.data?.status).toBe('DELIVERED');
  });

  it('action=status un-completing a step after 100% does not auto-revert the project status', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue({ id: 's-2', order: 2 } as never);
    prismaMock.projectStep.findMany.mockResolvedValue([
      { status: 'PENDING' },
      { status: 'COMPLETED' },
    ] as never);
    await PATCH(makePatch({ action: 'status', status: 'PENDING' }), ctxWith('p-1', 's-2'));
    const projectUpdateArg = prismaMock.project.update.mock.calls[0]?.[0];
    expect(projectUpdateArg?.data?.progress).toBe(50);
    expect(projectUpdateArg?.data?.status).toBeUndefined();
  });

  it('action=move does not touch project progress/status', async () => {
    prismaMock.projectStep.findFirst
      .mockResolvedValueOnce({ id: 's-1', order: 1 } as never)
      .mockResolvedValueOnce(null as never);
    await PATCH(makePatch({ action: 'move', direction: 'up' }), ctxWith('p-1', 's-1'));
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it('action=move at a boundary (no neighbor) -> 200 ok, no update', async () => {
    prismaMock.projectStep.findFirst
      .mockResolvedValueOnce({ id: 's-1', order: 1 } as never) // the step itself
      .mockResolvedValueOnce(null as never); // no neighbor at order 0
    const res = await PATCH(makePatch({ action: 'move', direction: 'up' }), ctxWith('p-1', 's-1'));
    expect(res.status).toBe(200);
    expect(prismaMock.projectStep.update).not.toHaveBeenCalled();
  });

  it('action=move swaps order with the neighbor', async () => {
    prismaMock.projectStep.findFirst
      .mockResolvedValueOnce({ id: 's-2', order: 2 } as never) // the step itself
      .mockResolvedValueOnce({ id: 's-1', order: 1 } as never); // neighbor above
    const res = await PATCH(makePatch({ action: 'move', direction: 'up' }), ctxWith('p-1', 's-2'));
    expect(res.status).toBe(200);
    expect(prismaMock.projectStep.update).toHaveBeenCalledTimes(2);
    const calls = prismaMock.projectStep.update.mock.calls;
    expect(calls[0]?.[0]).toMatchObject({ where: { id: 's-2' }, data: { order: 1 } });
    expect(calls[1]?.[0]).toMatchObject({ where: { id: 's-1' }, data: { order: 2 } });
  });

  it('action=edit updates title and description', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue({ id: 's-2', order: 2 } as never);
    const res = await PATCH(
      makePatch({ action: 'edit', title: 'Maquettes', description: 'Wireframes validés' }),
      ctxWith('p-1', 's-2'),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.projectStep.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 's-2' });
    expect(updateArg?.data).toEqual({ title: 'Maquettes', description: 'Wireframes validés' });
  });

  it('action=edit with empty description clears it to null', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue({ id: 's-2', order: 2 } as never);
    await PATCH(
      makePatch({ action: 'edit', title: 'Maquettes', description: '' }),
      ctxWith('p-1', 's-2'),
    );
    const updateArg = prismaMock.projectStep.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ title: 'Maquettes', description: null });
  });

  it('action=edit with blank title -> 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({ action: 'edit', title: '' }), ctxWith('p-1', 's-2'));
    expect(res.status).toBe(400);
    expect(prismaMock.projectStep.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/projects/[id]/steps/[stepId]', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await DELETE(makeDelete({ csrf: 'missing' }), ctxWith('p-1', 's-2'));
    expect(res.status).toBe(403);
    expect(prismaMock.projectStep.delete).not.toHaveBeenCalled();
  });

  it('project not owned by caller -> 404 PROJECT_NOT_FOUND', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await DELETE(makeDelete(), ctxWith('someone-elses', 's-2'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
  });

  it('step not found on this project -> 404 STEP_NOT_FOUND', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue(null as never);
    const res = await DELETE(makeDelete(), ctxWith('p-1', 'not-a-step'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('STEP_NOT_FOUND');
  });

  it('deletes the step and renormalizes remaining order to 1..N', async () => {
    prismaMock.projectStep.findFirst.mockResolvedValue({ id: 's-2', order: 2 } as never);
    prismaMock.projectStep.findMany.mockResolvedValue([
      { id: 's-1' },
      { id: 's-3' },
      { id: 's-4' },
    ] as never);
    const res = await DELETE(makeDelete(), ctxWith('p-1', 's-2'));
    expect(res.status).toBe(200);
    expect(prismaMock.projectStep.delete).toHaveBeenCalledWith({ where: { id: 's-2' } });
    expect(prismaMock.projectStep.update).toHaveBeenCalledTimes(3);
    const calls = prismaMock.projectStep.update.mock.calls;
    expect(calls[0]?.[0]).toMatchObject({ where: { id: 's-1' }, data: { order: 1 } });
    expect(calls[1]?.[0]).toMatchObject({ where: { id: 's-3' }, data: { order: 2 } });
    expect(calls[2]?.[0]).toMatchObject({ where: { id: 's-4' }, data: { order: 3 } });
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
