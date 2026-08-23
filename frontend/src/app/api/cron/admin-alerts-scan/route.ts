// Periodic scan for AdminAlert conditions that need polling rather than an
// inline hook: lockout spikes, session geo anomalies, coupon housekeeping,
// and stale HIGH-priority support tickets. See lib/server/admin-alerts/scan.ts
// for the per-signal criteria. Runs every 15 minutes (frontend/vercel.json).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { redis } from '@/lib/server/redis';
import { prisma } from '@/lib/server/prisma';
import { runAdminAlertsScan } from '@/lib/server/admin-alerts/scan';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let result: Awaited<ReturnType<typeof runAdminAlertsScan>> | null = null;

    await withLease(redis ?? undefined, 'admin-alerts-scan', LEASE_TTL_MS, async () => {
      result = await runAdminAlertsScan(prisma, redis);
      log.info('admin-alerts-scan tick', { result, requestId: ctx.requestId });
    });

    return NextResponse.json({ ok: true, result }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
