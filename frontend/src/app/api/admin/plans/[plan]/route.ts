// PATCH /api/admin/plans/[plan] — SUPERADMIN-only edit of a PlanConfig row
// (real-money change: pricing, FREE-tier limits, marketing feature list).
// Takes effect everywhere at once — see lib/server/billing/plans.ts's
// getPlanConfig, the single accessor every consumer (checkout, landing
// page, Paramètres → Abonnement, gating routes) reads through.
//
// Audit metadata shape (mirrors subscription.override): action:
// 'plan.update', metadata: { from: {...}, to: {...} } — only the fields
// actually present in the request body, so the audit log's diff sentence
// only lists what really changed.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPlanConfig, type Plan } from '@/lib/server/billing/plans';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z
  .object({
    monthlyAmount: z.number().int().positive().optional(),
    yearlyAmount: z.number().int().positive().optional(),
    currency: z.string().length(3).optional(),
    maxClients: z.number().int().nonnegative().optional(),
    maxActiveProjects: z.number().int().nonnegative().optional(),
    features: z.array(z.string().min(1).max(200)).max(10).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'At least one field is required',
  });

function isPlan(value: string): value is Plan {
  return value === 'FREE' || value === 'PRO';
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ plan: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { plan: planParam } = await ctx.params;
    if (!isPlan(planParam)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'plan must be FREE or PRO' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Ensures the row exists (upsert-on-read) before the update, so a
    // never-touched plan can still be edited on its very first PATCH.
    const existing = await getPlanConfig(prisma, planParam);

    const { monthlyAmount, yearlyAmount, currency, maxClients, maxActiveProjects, features } =
      parsed.data;
    const updated = await prisma.planConfig.update({
      where: { plan: planParam },
      data: {
        ...(monthlyAmount !== undefined ? { monthlyAmount } : {}),
        ...(yearlyAmount !== undefined ? { yearlyAmount } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(maxClients !== undefined ? { maxClients } : {}),
        ...(maxActiveProjects !== undefined ? { maxActiveProjects } : {}),
        ...(features !== undefined ? { features } : {}),
      },
    });

    const from: Record<string, unknown> = {};
    const to: Record<string, unknown> = {};
    for (const key of Object.keys(parsed.data) as (keyof typeof parsed.data)[]) {
      from[key] = existing[key];
      to[key] = updated[key];
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'plan.update',
      targetType: 'PlanConfig',
      targetId: planParam,
      metadata: { from, to },
    });

    return NextResponse.json(
      {
        plan: {
          plan: updated.plan,
          monthlyAmount: updated.monthlyAmount,
          yearlyAmount: updated.yearlyAmount,
          currency: updated.currency,
          maxClients: updated.maxClients,
          maxActiveProjects: updated.maxActiveProjects,
          features: updated.features,
          updatedAt: updated.updatedAt,
        },
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
