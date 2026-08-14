// DELETE /api/auth/account — Compte → Zone dangereuse "Supprimer mon compte".
// Pre-flight blocks mirror the schema's 3 onDelete:Restrict relations to
// User (Withdrawal, AdminAction.actorId, Organization.ownerId).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeReq(opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('https://test/api/auth/account', { method: 'DELETE', headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.withdrawal.count.mockResolvedValue(0 as never);
  prismaMock.adminAction.count.mockResolvedValue(0 as never);
  prismaMock.organization.count.mockResolvedValue(0 as never);
});

describe('DELETE /api/auth/account', () => {
  it('missing x-csrf-token -> 403, no delete', async () => {
    const res = await DELETE(makeReq({ csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('requireAuth bail -> 401', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await DELETE(makeReq());
    expect(res.status).toBe(401);
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('has withdrawal rows -> 409 ACCOUNT_HAS_WITHDRAWALS, no delete', async () => {
    prismaMock.withdrawal.count.mockResolvedValue(1 as never);
    const res = await DELETE(makeReq());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ACCOUNT_HAS_WITHDRAWALS');
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('has admin actions as actor -> 409 ACCOUNT_IS_ADMIN, no delete', async () => {
    prismaMock.adminAction.count.mockResolvedValue(1 as never);
    const res = await DELETE(makeReq());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ACCOUNT_IS_ADMIN');
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('owns an organization -> 409 ACCOUNT_OWNS_ORGANIZATION, no delete', async () => {
    prismaMock.organization.count.mockResolvedValue(1 as never);
    const res = await DELETE(makeReq());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ACCOUNT_OWNS_ORGANIZATION');
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('happy path -> 200, deletes user, clears cookies', async () => {
    prismaMock.user.delete.mockResolvedValue({ id: 'user-1' } as never);
    const res = await DELETE(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    const deleteArg = prismaMock.user.delete.mock.calls[0]?.[0];
    expect(deleteArg?.where?.id).toBe('user-1');

    expect(__cookieStore.get('app-token')?.value).toBe('');
    expect(__cookieStore.get('app-refresh')?.value).toBe('');
    expect(__cookieStore.get('app-csrf')?.value).toBe('');
  });
});
