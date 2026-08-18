// OBS-02 (Wave 2) — POST /api/admin/email-queue/[id]/requeue
//
// SUPERADMIN-only manual retry, mirrors outbox/[id]/requeue exactly (same
// FAILED|DEAD -> PENDING reset, same reasoning: the existing email-queue
// cron drain path already knows how to process a PENDING row safely).
//
// Audit metadata: action: 'email.requeue', metadata: { to, subject, previousStatus, previousAttempts }
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
    const existing = await prisma.emailJob.findUnique({
      where: { id },
      select: { id: true, to: true, subject: true, status: true, attempts: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'EMAIL_JOB_NOT_FOUND', message: 'Email job not found' },
        { status: 404 },
      );
    }
    if (!REQUEUABLE.has(existing.status)) {
      return NextResponse.json(
        { error: 'NOT_REQUEUABLE', message: 'Only FAILED or DEAD emails can be requeued.' },
        { status: 409 },
      );
    }

    const updated = await prisma.emailJob.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, scheduledAt: new Date() },
      select: { id: true, status: true, attempts: true },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'email.requeue',
      targetType: 'EmailJob',
      targetId: id,
      metadata: {
        to: existing.to,
        subject: existing.subject,
        previousStatus: existing.status,
        previousAttempts: existing.attempts,
      },
    });

    return NextResponse.json(
      { job: updated },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
