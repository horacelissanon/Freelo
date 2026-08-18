// ADMIN-09 (Wave 2) — PATCH /api/admin/subscriptions/[id]
//
// SUPERADMIN-only manual override — a comp/support gesture (e.g. "give this
// freelancer 30 days of Pro", "reset a stuck account back to Free") distinct
// from the normal purchase flow (POST /api/billing/subscribe). Every field
// is optional; at least one must be present. No provider/payment call here —
// this only ever touches the Subscription row, never Order/SubscriptionTransaction,
// so it can't accidentally trigger a real charge or refund.
//
// Audit metadata shape (mirrors user.role_change / user.suspend):
//   action: 'subscription.override', metadata: { from: {...}, to: {...} }
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

const Body = z
  .object({
    plan: z.enum(['FREE', 'PRO']).optional(),
    status: z.enum(['ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']).optional(),
    // Explicit null clears the field (no expiry — e.g. a comped Pro account
    // that never lapses). Omitted key leaves it untouched.
    currentPeriodEnd: z.string().datetime().nullable().optional(),
  })
  .refine(
    (b) => b.plan !== undefined || b.status !== undefined || b.currentPeriodEnd !== undefined,
    {
      message: 'At least one field is required',
    },
  );

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

    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found' },
        { status: 404 },
      );
    }

    const { plan, status, currentPeriodEnd } = parsed.data;
    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        ...(plan !== undefined ? { plan } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(currentPeriodEnd !== undefined
          ? { currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null }
          : {}),
      },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'subscription.override',
      targetType: 'Subscription',
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
      },
    });

    return NextResponse.json(
      {
        subscription: {
          id: updated.id,
          plan: updated.plan,
          status: updated.status,
          currentPeriodEnd: updated.currentPeriodEnd,
        },
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
