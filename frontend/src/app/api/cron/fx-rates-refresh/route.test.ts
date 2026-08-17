import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

const refreshCachedRates = vi.fn();
vi.mock('@/lib/server/fx/rates', () => ({ refreshCachedRates }));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  refreshCachedRates.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/fx-rates-refresh', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/fx-rates-refresh', () => {
  it('returns 401 when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(refreshCachedRates).not.toHaveBeenCalled();
  });

  it('refreshes and returns the new rates', async () => {
    const rates = { XOF: 655.957, EUR: 1, USD: 1.16, fetchedAt: '2026-08-18T00:00:00.000Z' };
    refreshCachedRates.mockResolvedValueOnce(rates);
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rates });
  });
});
