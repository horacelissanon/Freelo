// PATCH /api/admin/alerts/[id] — acknowledge or resolve an AdminAlert.
// ADMIN-gated (not SUPERADMIN) — triaging an operational alert is routine
// back-office work, same tier as support tickets (D-ADMIN-03 precedent in
// api/admin/support-tickets/[id]/route.ts). Every mutation is still audited
// via logAdminAction — AdminAlert (the signal) and AdminAction (the log of
// what an admin did about it) are complementary, not a replacement for each
// other.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  status: z.enum(['ACKNOWLEDGED', 'RESOLVED']),
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

    const existing = await prisma.adminAlert.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'ADMIN_ALERT_NOT_FOUND', message: 'Admin alert not found' },
        { status: 404 },
      );
    }

    const now = new Date();
    const updated = await prisma.adminAlert.update({
      where: { id },
      data:
        parsed.data.status === 'RESOLVED'
          ? {
              resolvedAt: now,
              acknowledgedAt: existing.acknowledgedAt ?? now,
              acknowledgedBy: existing.acknowledgedBy ?? auth.admin.id,
            }
          : {
              acknowledgedAt: existing.acknowledgedAt ?? now,
              acknowledgedBy: existing.acknowledgedBy ?? auth.admin.id,
            },
      select: { id: true, acknowledgedAt: true, acknowledgedBy: true, resolvedAt: true },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: parsed.data.status === 'RESOLVED' ? 'alert.resolve' : 'alert.acknowledge',
      targetType: 'AdminAlert',
      targetId: id,
      metadata: { type: existing.type, severity: existing.severity },
    });

    return NextResponse.json(
      {
        alert: {
          id: updated.id,
          acknowledgedAt: updated.acknowledgedAt ? updated.acknowledgedAt.toISOString() : null,
          acknowledgedBy: updated.acknowledgedBy,
          resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
        },
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
