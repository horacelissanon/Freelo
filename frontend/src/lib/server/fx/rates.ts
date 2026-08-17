import 'server-only';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

const REDIS_KEY = 'fx:rates:latest';
// Refreshed daily by the fx-rates-refresh cron — TTL gives ~1h of slack
// past the next scheduled run so a single missed tick doesn't blow the cache.
const CACHE_TTL_SECONDS = 25 * 60 * 60;

export interface FxRates {
  XOF: number;
  EUR: 1;
  USD: number;
}

export interface CachedFxRates extends FxRates {
  fetchedAt: string;
}

// Legal, treaty-fixed XOF/XAF↔EUR peg (unchanged since 1999) doubles as the
// last-resort fallback when the live API is unreachable and nothing is
// cached yet — only ever used in that worst case, and the USD leg is a
// rough anchor for that same scenario (same constant PricingToggle.tsx
// already carried before this system existed).
const FALLBACK_RATES: FxRates = { XOF: 655.957, EUR: 1, USD: 655.957 / 610 };

/** Hits open.er-api.com directly — no key, no signup, safe at 1 call/day. */
export async function fetchLiveRates(): Promise<FxRates> {
  const res = await fetch('https://open.er-api.com/v6/latest/EUR', {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`open.er-api.com responded ${res.status}`);
  }
  const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
  const xof = data.rates?.XOF;
  const usd = data.rates?.USD;
  if (data.result !== 'success' || !xof || !usd) {
    throw new Error('open.er-api.com returned an unexpected payload');
  }
  return { XOF: xof, EUR: 1, USD: usd };
}

/** Called by the daily cron — fetches fresh rates and writes them to cache. */
export async function refreshCachedRates(): Promise<CachedFxRates> {
  const rates = await fetchLiveRates();
  const cached: CachedFxRates = { ...rates, fetchedAt: new Date().toISOString() };
  if (redis) {
    await redis.set(REDIS_KEY, cached, { ex: CACHE_TTL_SECONDS });
  }
  return cached;
}

/**
 * Read path for everything else (forms pre-fill, the live converter,
 * PricingToggle). Never blocks on a slow/unreachable FX provider longer
 * than necessary: cache hit is instant; on a cold cache (first boot, before
 * the cron has run once) it tries one live fetch, then falls back to the
 * frozen constant rather than failing the caller.
 */
export async function getCachedRates(): Promise<CachedFxRates> {
  if (redis) {
    const cached = await redis.get<CachedFxRates>(REDIS_KEY);
    if (cached) return cached;
  }
  try {
    const rates = await fetchLiveRates();
    return { ...rates, fetchedAt: new Date().toISOString() };
  } catch (err) {
    log.warn('fx-rates: live fetch failed and no cache available, using fallback constant', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ...FALLBACK_RATES, fetchedAt: new Date(0).toISOString() };
  }
}
