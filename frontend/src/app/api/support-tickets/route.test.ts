// Freelancer-facing support ticket routes.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);

const authCtx = { user: { sub: 'user-1', email: 'freelancer@test.local' } };

function makeGet(url: string = 'http://test/api/support-tickets'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/support-tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue(authCtx);
});

describe('GET /api/support-tickets', () => {
  it('returns only the caller-s own tickets', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([
      {
        id: 't1',
        subject: 'Facture non envoyée',
        message: 'Détails...',
        priority: 'HIGH',
        status: 'OPEN',
        createdAt: new Date(),
      },
    ] as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    const args = prismaMock.supportTicket.findMany.mock.calls[0]?.[0];
    expect(args?.where?.userId).toBe('user-1');
  });

  it('401s when not authenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.supportTicket.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/support-tickets', () => {
  it('creates a ticket for the caller, defaulting priority to MEDIUM', async () => {
    prismaMock.supportTicket.create.mockResolvedValue({
      id: 't1',
      subject: 'Question',
      message: 'Comment exporter mes devis en PDF ?',
      priority: 'MEDIUM',
      status: 'OPEN',
      createdAt: new Date(),
    } as never);

    const res = await POST(
      makePost({ subject: 'Question', message: 'Comment exporter mes devis en PDF ?' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket).toMatchObject({ subject: 'Question', priority: 'MEDIUM' });

    const createArg = prismaMock.supportTicket.create.mock.calls[0]?.[0];
    expect(createArg?.data).toMatchObject({ userId: 'user-1', priority: 'MEDIUM' });
  });

  it('accepts an explicit priority', async () => {
    prismaMock.supportTicket.create.mockResolvedValue({
      id: 't2',
      subject: 'Urgent',
      message: 'Ma facture ne se génère pas du tout, blocage total.',
      priority: 'HIGH',
      status: 'OPEN',
      createdAt: new Date(),
    } as never);

    await POST(
      makePost({
        subject: 'Urgent',
        message: 'Ma facture ne se génère pas du tout, blocage total.',
        priority: 'HIGH',
      }),
    );
    const createArg = prismaMock.supportTicket.create.mock.calls[0]?.[0];
    expect(createArg?.data.priority).toBe('HIGH');
  });

  it('400s on a too-short message', async () => {
    const res = await POST(makePost({ subject: 'Hi', message: 'short' }));
    expect(res.status).toBe(400);
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it('missing CSRF -> 403, no Prisma call', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_MISMATCH' }, { status: 403 }),
    );
    const res = await POST(makePost({ subject: 'Question', message: 'Un message assez long.' }));
    expect(res.status).toBe(403);
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });
});
