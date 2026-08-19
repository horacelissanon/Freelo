// ADMIN-10 — PATCH /api/admin/support-tickets/[id] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { seedAdmin } from '@/test-utils/admin-fixtures';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const admin = seedAdmin({ id: 'admin-1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/support-tickets/ticket-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeCtx() {
  return { params: Promise.resolve({ id: 'ticket-1' }) };
}

const existingTicket = {
  id: 'ticket-1',
  userId: 'user-1',
  subject: 'Question',
  message: 'Un message.',
  priority: 'MEDIUM',
  status: 'OPEN',
  createdAt: new Date('2026-08-18T00:00:00.000Z'),
  updatedAt: new Date('2026-08-18T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('PATCH /api/admin/support-tickets/[id]', () => {
  it('updates status and logs support.status_change', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(existingTicket as never);
    prismaMock.supportTicket.update.mockResolvedValue({
      id: 'ticket-1',
      status: 'IN_PROGRESS',
    } as never);

    const res = await PATCH(makePatch({ status: 'IN_PROGRESS' }), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toEqual({ id: 'ticket-1', status: 'IN_PROGRESS' });

    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    const call = mockLogAdminAction.mock.calls[0]?.[1];
    expect(call).toMatchObject({
      action: 'support.status_change',
      targetType: 'SupportTicket',
      metadata: { from: 'OPEN', to: 'IN_PROGRESS' },
    });
  });

  it('404s when the ticket does not exist', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: 'RESOLVED' }), makeCtx());
    expect(res.status).toBe(404);
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled();
  });

  it('400s on an invalid status value', async () => {
    const res = await PATCH(makePatch({ status: 'CLOSED' }), makeCtx());
    expect(res.status).toBe(400);
    expect(prismaMock.supportTicket.findUnique).not.toHaveBeenCalled();
  });

  it('403s when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await PATCH(makePatch({ status: 'RESOLVED' }), makeCtx());
    expect(res.status).toBe(403);
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled();
  });

  it('missing CSRF -> 403, no Prisma call', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_MISMATCH' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ status: 'RESOLVED' }), makeCtx());
    expect(res.status).toBe(403);
    expect(prismaMock.supportTicket.findUnique).not.toHaveBeenCalled();
  });
});
