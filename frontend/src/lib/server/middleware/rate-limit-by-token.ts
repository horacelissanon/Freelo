// Public-route rate limiter keyed by an opaque token (project/client
// tracking token) rather than a userId or email — mirrors
// rate-limit-by-userid.ts's fail-open-in-dev / fail-closed-in-prod
// semantics, since these routes have no session to fall back on.
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';

export async function enforceTokenRateLimit(
  prefix: string,
  token: string,
  { windowMs, maxHits }: { windowMs: number; maxHits: number },
): Promise<NextResponse | null> {
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'RATE_LIMIT_BACKEND_UNAVAILABLE', message: 'Rate-limit backend unavailable.' },
        { status: 503 },
      );
    }
    return null;
  }
  const store = new RedisRateLimitStore({ redis, prefix: '', windowMs });
  const { totalHits, resetTime } = await store.increment(`${prefix}${token}`);
  if (totalHits > maxHits) {
    const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'TOO_MANY_REQUESTS', message: 'Trop de requêtes ; réessayez dans un instant.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(maxHits),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }
  return null;
}
