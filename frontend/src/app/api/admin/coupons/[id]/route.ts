// PATCH /api/admin/coupons/[id] — SUPERADMIN-only toggle of a coupon's
// `active` flag (real-money change, same precedent as
// PATCH /api/admin/plans/[plan]). code/percentOff are immutable — see
// api/admin/coupons/route.ts's header for why.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ active: z.boolean() });

export async function PATCH(
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

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'active (boolean) is required' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Coupon not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { active } = parsed.data;
    const updated = await prisma.coupon.update({ where: { id }, data: { active } });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'coupon.update',
      targetType: 'Coupon',
      targetId: id,
      metadata: { from: { active: existing.active }, to: { active } },
    });

    return NextResponse.json(
      { coupon: updated },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
