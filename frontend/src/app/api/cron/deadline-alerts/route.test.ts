import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

const sweepDeadlineAlertsMock = vi.fn();
vi.mock('@/lib/server/deadlines/sweep', () => ({
  sweepDeadlineAlerts: sweepDeadlineAlertsMock,
}));

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  sweepDeadlineAlertsMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/deadline-alerts', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/deadline-alerts', () => {
  it('returns 401 when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('calls sweepDeadlineAlerts with prisma and returns its counts', async () => {
    sweepDeadlineAlertsMock.mockResolvedValueOnce({
      invoicesFlaggedOverdue: 2,
      invoiceNotifications: 2,
      projectNotifications: 1,
    });
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(sweepDeadlineAlertsMock).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      invoicesFlaggedOverdue: 2,
      invoiceNotifications: 2,
      projectNotifications: 1,
    });
  });
});
