// Public review submission on the Client Link Portal — no auth. Only
// allowed once the project is DELIVERED; re-posting upserts (never errors
// on a duplicate submission, unlike Invoice's frozen-once-sent invariant).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function ctxWith(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

function makePost(body: unknown, token: string): NextRequest {
  return new NextRequest(`http://test/api/track/${token}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/track/[token]/review', () => {
  it('DELIVERED project + valid body -> 200, upsert called with rating/comment', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'p-1',
      userId: 'u-1',
      clientId: 'c-1',
      status: 'DELIVERED',
      user: { publicPortalEnabled: true },
    } as never);
    prismaMock.review.upsert.mockResolvedValue({
      rating: 5,
      comment: 'Superbe travail !',
    } as never);

    const res = await POST(
      makePost({ rating: 5, comment: 'Superbe travail !' }, 'tok-1'),
      ctxWith('tok-1'),
    );
    expect(res.status).toBe(200);

    const upsertArg = prismaMock.review.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.where).toEqual({ projectId: 'p-1' });
    expect(upsertArg?.create).toMatchObject({
      projectId: 'p-1',
      userId: 'u-1',
      clientId: 'c-1',
      rating: 5,
      comment: 'Superbe travail !',
    });
  });

  it('rating out of range (0) -> 400 VALIDATION_FAILED, no Prisma call', async () => {
    const res = await POST(makePost({ rating: 0 }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.review.upsert).not.toHaveBeenCalled();
  });

  it('rating out of range (6) -> 400 VALIDATION_FAILED, no Prisma call', async () => {
    const res = await POST(makePost({ rating: 6 }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.review.upsert).not.toHaveBeenCalled();
  });

  it('unknown token -> 404 NOT_FOUND, no review created', async () => {
    prismaMock.project.findUnique.mockResolvedValue(null);
    const res = await POST(makePost({ rating: 4 }, 'does-not-exist'), ctxWith('does-not-exist'));
    expect(res.status).toBe(404);
    expect(prismaMock.review.upsert).not.toHaveBeenCalled();
  });

  it('owner has publicPortalEnabled=false -> 404 NOT_FOUND, no review created', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'p-1',
      userId: 'u-1',
      clientId: 'c-1',
      status: 'DELIVERED',
      user: { publicPortalEnabled: false },
    } as never);

    const res = await POST(makePost({ rating: 4 }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(404);
    expect(prismaMock.review.upsert).not.toHaveBeenCalled();
  });

  it('project not DELIVERED -> 409 PROJECT_NOT_DELIVERED, no review created', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'p-1',
      userId: 'u-1',
      clientId: 'c-1',
      status: 'IN_PROGRESS',
      user: { publicPortalEnabled: true },
    } as never);

    const res = await POST(makePost({ rating: 4 }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('PROJECT_NOT_DELIVERED');
    expect(prismaMock.review.upsert).not.toHaveBeenCalled();
  });

  it('re-submitting an existing review -> upsert update branch carries new rating/comment', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'p-1',
      userId: 'u-1',
      clientId: 'c-1',
      status: 'DELIVERED',
      user: { publicPortalEnabled: true },
    } as never);
    prismaMock.review.upsert.mockResolvedValue({
      rating: 3,
      comment: 'Finalement mitigé',
    } as never);

    const res = await POST(
      makePost({ rating: 3, comment: 'Finalement mitigé' }, 'tok-1'),
      ctxWith('tok-1'),
    );
    expect(res.status).toBe(200);

    const upsertArg = prismaMock.review.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.update).toEqual({ rating: 3, comment: 'Finalement mitigé' });
  });

  it("source exports runtime = 'nodejs' (Phase 0 guard)", async () => {
    const mod = await import('./route');
    expect(mod.runtime).toBe('nodejs');
  });
});
