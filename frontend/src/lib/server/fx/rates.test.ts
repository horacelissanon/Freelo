import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const redisGet = vi.fn();
const redisSet = vi.fn();
let redisMock: { get: typeof redisGet; set: typeof redisSet } | null = null;
vi.mock('@/lib/server/redis', () => ({
  get redis() {
    return redisMock;
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
  redisMock = { get: redisGet, set: redisSet };
  fetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('fetchLiveRates', () => {
  it('parses a successful open.er-api.com response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ result: 'success', rates: { XOF: 655.957, USD: 1.16 } }),
    );
    const { fetchLiveRates } = await import('./rates');
    await expect(fetchLiveRates()).resolves.toEqual({ XOF: 655.957, EUR: 1, USD: 1.16 });
  });

  it('throws when the provider responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    const { fetchLiveRates } = await import('./rates');
    await expect(fetchLiveRates()).rejects.toThrow(/responded 500/);
  });

  it('throws when the payload is missing expected rates', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 'success', rates: { XOF: 655.957 } }));
    const { fetchLiveRates } = await import('./rates');
    await expect(fetchLiveRates()).rejects.toThrow(/unexpected payload/);
  });
});

describe('refreshCachedRates', () => {
  it('fetches live rates and writes them to Redis with a TTL', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ result: 'success', rates: { XOF: 655.957, USD: 1.16 } }),
    );
    const { refreshCachedRates } = await import('./rates');
    const result = await refreshCachedRates();
    expect(result).toMatchObject({ XOF: 655.957, EUR: 1, USD: 1.16 });
    expect(redisSet).toHaveBeenCalledWith(
      'fx:rates:latest',
      expect.objectContaining({ XOF: 655.957 }),
      { ex: expect.any(Number) },
    );
  });
});

describe('getCachedRates', () => {
  it('returns the cached value on a cache hit, without calling the live provider', async () => {
    const cached = { XOF: 655.957, EUR: 1 as const, USD: 1.16, fetchedAt: '2026-08-18T00:00:00Z' };
    redisGet.mockResolvedValueOnce(cached);
    const { getCachedRates } = await import('./rates');
    await expect(getCachedRates()).resolves.toEqual(cached);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to a live fetch on a cold cache', async () => {
    redisGet.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ result: 'success', rates: { XOF: 655.957, USD: 1.16 } }),
    );
    const { getCachedRates } = await import('./rates');
    const result = await getCachedRates();
    expect(result).toMatchObject({ XOF: 655.957, EUR: 1, USD: 1.16 });
  });

  it('falls back to the frozen constant when both cache and live fetch fail', async () => {
    redisGet.mockResolvedValueOnce(null);
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const { getCachedRates } = await import('./rates');
    const result = await getCachedRates();
    expect(result.XOF).toBeCloseTo(655.957);
    expect(result.EUR).toBe(1);
  });

  it('falls back to the frozen constant when Redis is not configured at all', async () => {
    redisMock = null;
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const { getCachedRates } = await import('./rates');
    const result = await getCachedRates();
    expect(result.XOF).toBeCloseTo(655.957);
  });
});
