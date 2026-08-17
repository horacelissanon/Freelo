import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCachedRates = vi.fn();
vi.mock('@/lib/server/fx/rates', () => ({ getCachedRates }));

describe('GET /api/fx-rates', () => {
  it('returns the cached rates with no auth required', async () => {
    const rates = { XOF: 655.957, EUR: 1, USD: 1.16, fetchedAt: '2026-08-18T00:00:00Z' };
    getCachedRates.mockResolvedValueOnce(rates);
    const { GET } = await import('./route');
    const res = await GET(new NextRequest('http://localhost/api/fx-rates'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rates);
  });
});
