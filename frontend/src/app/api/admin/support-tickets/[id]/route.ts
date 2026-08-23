// ADMIN-10 — PATCH /api/admin/support-tickets/[id]
//
// ADMIN-gated (not SUPERADMIN) — changing a ticket's triage status is
// routine support work, not a sensitive financial/security action, same
// tier as reading Orders/Withdrawals (D-ADMIN-03).
//
// Audit metadata: action: 'support.status_change', metadata: { from, to }
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { createNotification } from '@/lib/server/notifications';
import {
  supportTicketResolved,
  supportTicketInProgress,
} from '@/lib/server/notifications/templates';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400 },
      );
    }

    const existing = await prisma.supportTicket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'SUPPORT_TICKET_NOT_FOUND', message: 'Support ticket not found' },
        { status: 404 },
      );
    }

    const updated = await prisma.supportTicket.update({
      where: { id },
      data: { status: parsed.data.status },
      select: { id: true, status: true, updatedAt: true },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'support.status_change',
      targetType: 'SupportTicket',
      targetId: id,
      metadata: { from: existing.status, to: updated.status },
    });

    if (updated.status !== existing.status) {
      try {
        const updatedAtIso = updated.updatedAt.toISOString();
        if (updated.status === 'RESOLVED') {
          await createNotification(
            prisma,
            supportTicketResolved(existing.userId, id, existing.subject, updatedAtIso),
          );
        } else if (updated.status === 'IN_PROGRESS') {
          await createNotification(
            prisma,
            supportTicketInProgress(existing.userId, id, existing.subject, updatedAtIso),
          );
        }
      } catch {
        // Best-effort — the status change is already committed.
      }
    }

    return NextResponse.json(
      { ticket: updated },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
