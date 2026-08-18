// OBS-01 (Wave 2) — POST /api/admin/outbox/[id]/requeue tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { seedSuperadmin, seedOutbox } from '@/test-utils/admin-fixtures';

vi.mock('@/lib/server/middleware', () => ({
  requireSuperadmin: vi.fn(),
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

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { POST } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const superadmin = seedSuperadmin({ id: 'superadmin-1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makePost(): NextRequest {
  return new NextRequest('http://test/api/admin/outbox/ob-1/requeue', { method: 'POST' });
}
function makeCtx() {
  return { params: Promise.resolve({ id: 'ob-1' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('POST /api/admin/outbox/[id]/requeue', () => {
  it('resets a DEAD event to PENDING with attempts=0', async () => {
    prismaMock.outboxEvent.findUnique.mockResolvedValue(
      seedOutbox({ id: 'ob-1', status: 'DEAD', attempts: 5 }) as never,
    );
    prismaMock.outboxEvent.update.mockResolvedValue(
      seedOutbox({ id: 'ob-1', status: 'PENDING', attempts: 0 }) as never,
    );

    const res = await POST(makePost(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event).toMatchObject({ id: 'ob-1', status: 'PENDING', attempts: 0 });

    const updateArg = prismaMock.outboxEvent.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
  });

  it('409s when the event is not FAILED or DEAD', async () => {
    prismaMock.outboxEvent.findUnique.mockResolvedValue(
      seedOutbox({ id: 'ob-1', status: 'SENT' }) as never,
    );
    const res = await POST(makePost(), makeCtx());
    expect(res.status).toBe(409);
    expect(prismaMock.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('404s when the event does not exist', async () => {
    prismaMock.outboxEvent.findUnique.mockResolvedValue(null);
    const res = await POST(makePost(), makeCtx());
    expect(res.status).toBe(404);
  });

  it('403s for non-SUPERADMIN callers', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await POST(makePost(), makeCtx());
    expect(res.status).toBe(403);
    expect(prismaMock.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('missing CSRF -> 403, no Prisma call', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_MISMATCH' }, { status: 403 }),
    );
    const res = await POST(makePost(), makeCtx());
    expect(res.status).toBe(403);
    expect(prismaMock.outboxEvent.findUnique).not.toHaveBeenCalled();
  });
});
