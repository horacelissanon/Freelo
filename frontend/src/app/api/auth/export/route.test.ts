// GET /api/auth/export — Compte → Zone dangereuse "Exporter mes données".
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeReq(): NextRequest {
  return new NextRequest('https://test/api/auth/export', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('GET /api/auth/export', () => {
  it('requireAuth bail -> 401', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('unknown user -> 404 NOT_FOUND', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(404);
  });

  it('happy path -> 200, omits passwordHash/withdrawalPinHash, sets download header', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'me@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      name: 'Aïssatou',
      avatarUrl: null,
      phone: null,
      bio: null,
      studioName: 'Studio A',
      taxId: null,
      address: null,
      defaultCurrency: 'XOF',
      language: 'fr',
      showPaidInvoicesDefault: true,
      publicPortalEnabled: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      clients: [],
      projects: [],
      invoices: [],
      orders: [],
      withdrawals: [],
      notifications: [],
      subscription: null,
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('attachment');

    const body = await res.json();
    expect(body.user.email).toBe('me@example.com');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.user).not.toHaveProperty('withdrawalPinHash');

    const selectArg = prismaMock.user.findUnique.mock.calls[0]?.[0]?.select;
    expect(selectArg).not.toHaveProperty('passwordHash');
    expect(selectArg).not.toHaveProperty('withdrawalPinHash');
  });
});
