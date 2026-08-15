// Hourly cron — turns overdue invoices and soon-due projects into real
// alerts: flips Invoice.status SENT → OVERDUE (previously nothing ever did
// this, so the dashboard's overdueCount stat and AlertBanner could never
// fire) and writes a Notification row for each, so the bell's badge count
// and list become the single feed for every deadline-driven alert.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { sweepDeadlineAlerts } from '@/lib/server/deadlines/sweep';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let result = { invoicesFlaggedOverdue: 0, invoiceNotifications: 0, projectNotifications: 0 };

    await withLease(redis ?? undefined, 'deadline-alerts', LEASE_TTL_MS, async () => {
      result = await sweepDeadlineAlerts(prisma);
      log.info('deadline-alerts tick', { ...result, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
