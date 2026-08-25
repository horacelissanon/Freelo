// Public comment posting on the Client Link Portal — no auth. `author` must
// always be forced to CLIENT server-side regardless of what's requested.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function ctxWith(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

function makePost(body: unknown, token: string): NextRequest {
  return new NextRequest(`http://test/api/track/${token}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/track/[token]/comments', () => {
  it('valid body + known token -> 201, author forced to CLIENT', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'p-1',
      user: {
        publicPortalEnabled: true,
        subscription: { plan: 'PRO', status: 'ACTIVE', currentPeriodEnd: null },
      },
    } as never);
    prismaMock.projectComment.create.mockResolvedValue({
      id: 'c-1',
      projectId: 'p-1',
      author: 'CLIENT',
      body: 'Merci !',
      createdAt: new Date(),
    } as never);

    const res = await POST(makePost({ body: 'Merci !' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(201);

    const createArg = prismaMock.projectComment.create.mock.calls[0]?.[0];
    expect(createArg?.data?.author).toBe('CLIENT');
    expect(createArg?.data?.projectId).toBe('p-1');
  });

  it('empty body -> 400 VALIDATION_FAILED, no Prisma call', async () => {
    const res = await POST(makePost({ body: '' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.projectComment.create).not.toHaveBeenCalled();
  });

  it('unknown token -> 404 NOT_FOUND, no comment created', async () => {
    prismaMock.project.findUnique.mockResolvedValue(null);
    const res = await POST(
      makePost({ body: 'Hello' }, 'does-not-exist'),
      ctxWith('does-not-exist'),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.projectComment.create).not.toHaveBeenCalled();
  });

  it('owner has publicPortalEnabled=false -> 404 NOT_FOUND, no comment created', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'p-1',
      user: { publicPortalEnabled: false, subscription: null },
    } as never);

    const res = await POST(makePost({ body: 'Merci !' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(404);
    expect(prismaMock.projectComment.create).not.toHaveBeenCalled();
  });

  it('owner is on FREE plan -> 201, comments are not Pro-gated', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'p-1',
      user: { publicPortalEnabled: true },
    } as never);
    prismaMock.projectComment.create.mockResolvedValue({
      id: 'c-1',
      projectId: 'p-1',
      author: 'CLIENT',
      body: 'Merci !',
      createdAt: new Date(),
    } as never);

    const res = await POST(makePost({ body: 'Merci !' }, 'tok-1'), ctxWith('tok-1'));
    expect(res.status).toBe(201);
    expect(prismaMock.projectComment.create).toHaveBeenCalled();
  });

  it('attachmentType AUDIO -> 400 (voice messages removed SaaS-wide)', async () => {
    const res = await POST(
      makePost(
        {
          body: '',
          attachmentUrl: 'https://res.cloudinary.com/x/audio/upload/v1/note.webm',
          attachmentType: 'AUDIO',
        },
        'tok-1',
      ),
      ctxWith('tok-1'),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.projectComment.create).not.toHaveBeenCalled();
  });
});
