// PATCH /api/admin/users/[id]/subscription — SUPERADMIN-only comp/support
// gesture reachable directly from a user row on /admin/users ("promote to
// Pro" / "cancel Pro"), rather than requiring the admin to hop over to
// /admin/subscriptions and find the matching Subscription row by email.
// Keyed by User.id (not Subscription.id) for that reason — getOrCreateSubscription
// guarantees a row exists even for a user who never touched billing.
//
// Same "only ever touches the Subscription row" safety as
// /api/admin/subscriptions/[id] (see that route's header comment) — no
// provider/payment call, can't trigger a real charge or refund. `grant`
// comps exactly one calendar month of Pro (MONTHLY cycle); an admin can
// re-run it to extend. `revoke` resets to a clean Free state.
//
// Audit metadata shape (mirrors subscription.override):
//   action: 'user.grant_pro' | 'user.revoke_pro', metadata: { from: {...}, to: {...} }
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { getOrCreateSubscription, isProActive } from '@/lib/server/billing/subscription';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  action: z.enum(['grant', 'revoke']),
  reason: z.string().min(1).max(500).optional(),
});

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404 },
      );
    }

    const existing = await getOrCreateSubscription(prisma, id);

    const data =
      parsed.data.action === 'grant'
        ? {
            plan: 'PRO' as const,
            status: 'ACTIVE' as const,
            billingCycle: 'MONTHLY' as const,
            currentPeriodEnd: new Date(Date.now() + THIRTY_DAYS_MS),
            cancelAtPeriodEnd: false,
          }
        : {
            plan: 'FREE' as const,
            status: 'CANCELED' as const,
            billingCycle: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
          };

    const updated = await prisma.subscription.update({ where: { userId: id }, data });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: parsed.data.action === 'grant' ? 'user.grant_pro' : 'user.revoke_pro',
      targetType: 'User',
      targetId: id,
      metadata: {
        from: {
          plan: existing.plan,
          status: existing.status,
          currentPeriodEnd: existing.currentPeriodEnd,
        },
        to: {
          plan: updated.plan,
          status: updated.status,
          currentPeriodEnd: updated.currentPeriodEnd,
        },
        ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
      },
    });

    return NextResponse.json(
      {
        subscription: {
          plan: updated.plan,
          status: updated.status,
          currentPeriodEnd: updated.currentPeriodEnd,
          isProActive: isProActive(updated),
        },
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
