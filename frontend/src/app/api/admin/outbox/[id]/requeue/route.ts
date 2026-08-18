// OBS-01 (Wave 2) — POST /api/admin/outbox/[id]/requeue
//
// SUPERADMIN-only manual retry for a stuck event. Only allowed from FAILED
// or DEAD — resets attempts to 0 and scheduledAt to now so the existing
// outbox cron (drainOutbox, every 1 min) picks it back up through its normal
// dispatch path. No new dispatch logic here; this route only flips the row
// back to PENDING, the same state a fresh event starts in.
//
// Audit metadata: action: 'outbox.requeue', metadata: { kind, previousStatus, previousAttempts }
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REQUEUABLE: ReadonlySet<string> = new Set(['FAILED', 'DEAD']);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const existing = await prisma.outboxEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'OUTBOX_EVENT_NOT_FOUND', message: 'Outbox event not found' },
        { status: 404 },
      );
    }
    if (!REQUEUABLE.has(existing.status)) {
      return NextResponse.json(
        { error: 'NOT_REQUEUABLE', message: 'Only FAILED or DEAD events can be requeued.' },
        { status: 409 },
      );
    }

    const updated = await prisma.outboxEvent.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, scheduledAt: new Date() },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'outbox.requeue',
      targetType: 'OutboxEvent',
      targetId: id,
      metadata: {
        kind: existing.kind,
        previousStatus: existing.status,
        previousAttempts: existing.attempts,
      },
    });

    return NextResponse.json(
      { event: { id: updated.id, status: updated.status, attempts: updated.attempts } },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
