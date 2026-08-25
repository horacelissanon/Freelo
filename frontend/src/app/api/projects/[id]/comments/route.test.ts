// Freelancer-side reply on a project's comment thread. The invariant under
// test: `author` is always forced to FREELANCER server-side — the caller
// can never set it (mirrors the public route forcing CLIENT).
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
  return new NextRequest('http://test/api/projects/p-1/comments', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('POST /api/projects/[id]/comments', () => {
  it('missing x-csrf-token -> 403, no Prisma call', async () => {
    const res = await POST(makePost({ body: 'hi' }, { csrf: 'missing' }), ctxWith('p-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.projectComment.create).not.toHaveBeenCalled();
  });

  it('project not owned by caller -> 404 PROJECT_NOT_FOUND', async () => {
    prismaMock.project.findFirst.mockResolvedValue(null as never);
    const res = await POST(makePost({ body: 'hi' }), ctxWith('someone-elses'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
    expect(prismaMock.projectComment.create).not.toHaveBeenCalled();
  });

  it('empty body -> 400 VALIDATION_FAILED', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'p-1' } as never);
    const res = await POST(makePost({ body: '' }), ctxWith('p-1'));
    expect(res.status).toBe(400);
  });

  it('valid body -> 201, author forced to FREELANCER', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'p-1' } as never);
    prismaMock.projectComment.create.mockResolvedValue({
      id: 'c-1',
      projectId: 'p-1',
      author: 'FREELANCER',
      body: 'On avance bien.',
      createdAt: new Date('2026-05-01T00:00:00Z'),
    } as never);

    const res = await POST(makePost({ body: 'On avance bien.' }), ctxWith('p-1'));
    expect(res.status).toBe(201);
    const createArg = prismaMock.projectComment.create.mock.calls[0]?.[0];
    expect(createArg?.data?.author).toBe('FREELANCER');
    expect(createArg?.data?.projectId).toBe('p-1');

    const findArg = prismaMock.project.findFirst.mock.calls[0]?.[0];
    expect(findArg?.where?.userId).toBe('user-1');
  });

  it('empty body with no attachment -> 400 VALIDATION_FAILED', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'p-1' } as never);
    const res = await POST(makePost({ body: '' }), ctxWith('p-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.projectComment.create).not.toHaveBeenCalled();
  });

  it('attachment-only (no text) -> 201', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'p-1' } as never);
    prismaMock.projectComment.create.mockResolvedValue({
      id: 'c-2',
      projectId: 'p-1',
      author: 'FREELANCER',
      body: '',
      attachmentUrl: 'https://res.cloudinary.com/x/image/upload/v1/photo.jpg',
      attachmentType: 'IMAGE',
      createdAt: new Date('2026-05-01T00:00:00Z'),
    } as never);

    const res = await POST(
      makePost({
        body: '',
        attachmentUrl: 'https://res.cloudinary.com/x/image/upload/v1/photo.jpg',
        attachmentType: 'IMAGE',
      }),
      ctxWith('p-1'),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.projectComment.create.mock.calls[0]?.[0];
    expect(createArg?.data?.attachmentType).toBe('IMAGE');
    expect(createArg?.data?.attachmentUrl).toBe(
      'https://res.cloudinary.com/x/image/upload/v1/photo.jpg',
    );
  });

  it('attachmentType AUDIO -> 400 (voice messages removed SaaS-wide)', async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: 'p-1' } as never);
    const res = await POST(
      makePost({
        body: '',
        attachmentUrl: 'https://res.cloudinary.com/x/audio/upload/v1/note.webm',
        attachmentType: 'AUDIO',
      }),
      ctxWith('p-1'),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.projectComment.create).not.toHaveBeenCalled();
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
