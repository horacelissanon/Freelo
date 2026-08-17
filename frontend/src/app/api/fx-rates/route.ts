// Public, unauthenticated on purpose — an exchange rate isn't sensitive
// data, and the public pricing page (PricingToggle.tsx) needs it without a
// session. Serves the Redis-cached rate refreshed daily by the
// fx-rates-refresh cron; never calls the live provider itself on the
// request path (see lib/server/fx/rates.ts for the cache/fallback chain).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getCachedRates } from '@/lib/server/fx/rates';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const rates = await getCachedRates();
    return NextResponse.json(rates, {
      headers: { 'x-request-id': ctx.requestId, 'Cache-Control': 'public, max-age=300' },
    });
  });
}
