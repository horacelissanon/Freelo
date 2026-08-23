export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // D-10

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { redis } from '@/lib/server/redis';
import { refreshCachedRates } from '@/lib/server/fx/rates';
import { prisma } from '@/lib/server/prisma';
import { createAdminAlert } from '@/lib/server/admin-alerts';
import { fxRatesStale } from '@/lib/server/admin-alerts/templates';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000; // ~2 × maxDuration (Pitfall 3)
const FAIL_COUNTER_KEY = 'fx:refresh-fail-count';
const FAIL_ALERT_THRESHOLD = 2;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let rates: Awaited<ReturnType<typeof refreshCachedRates>> | null = null;

    await withLease(redis ?? undefined, 'fx-rates-refresh', LEASE_TTL_MS, async () => {
      try {
        rates = await refreshCachedRates();
        if (redis) await redis.del(FAIL_COUNTER_KEY);
        log.info('fx-rates-refresh tick', { rates, requestId: ctx.requestId });
      } catch (err) {
        log.error('fx-rates-refresh: refresh failed', {
          err: err instanceof Error ? err.message : String(err),
          requestId: ctx.requestId,
        });
        // 2 consecutive failures means the 25h cache TTL is about to expire
        // with nothing behind it — the app would fall back to the frozen
        // 1999 constant for every reader (see getCachedRates fallback).
        if (redis) {
          const failCount = await redis.incr(FAIL_COUNTER_KEY);
          if (failCount >= FAIL_ALERT_THRESHOLD) {
            const todayKey = new Date().toISOString().slice(0, 10);
            await createAdminAlert(prisma, fxRatesStale(todayKey));
          }
        }
      }
    });

    return NextResponse.json({ ok: true, rates }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
