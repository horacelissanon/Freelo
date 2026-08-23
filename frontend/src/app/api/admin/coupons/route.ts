// GET /api/admin/coupons — Super Admin "Coupons" listing (ADMIN readable,
// mirrors admin/plans's read/write split). POST creates a new coupon
// (SUPERADMIN-only — a discount is a real-money change, same precedent as
// PATCH /api/admin/plans/[plan]). Coupons are immutable after creation
// (code/percentOff never change) — see PATCH /api/admin/coupons/[id] for
// the only allowed edit (toggling `active`).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { normalizeCouponCode } from '@/lib/server/billing/coupons';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateBody = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Code must be alphanumeric (dashes/underscores allowed)'),
    discountType: z.enum(['PERCENT', 'AMOUNT']).default('PERCENT'),
    percentOff: z.number().int().min(1).max(99).optional(),
    amountOff: z.number().int().min(1).optional(),
    billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
    maxRedemptions: z.number().int().min(1).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .refine(
    (data) =>
      data.discountType === 'PERCENT'
        ? data.percentOff !== undefined
        : data.amountOff !== undefined,
    {
      message: 'percentOff is required for PERCENT, amountOff is required for AMOUNT',
      path: ['percentOff'],
    },
  );

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const rows = await prisma.coupon.findMany({
      where: cursorWhere(cursor),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(page, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { code, discountType, percentOff, amountOff, billingCycle, maxRedemptions, expiresAt } =
      parsed.data;

    let coupon;
    try {
      coupon = await prisma.coupon.create({
        data: {
          code: normalizeCouponCode(code),
          discountType,
          percentOff: discountType === 'PERCENT' ? (percentOff ?? null) : null,
          amountOff: discountType === 'AMOUNT' ? (amountOff ?? null) : null,
          billingCycle: billingCycle ?? null,
          maxRedemptions: maxRedemptions ?? null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        return NextResponse.json(
          { error: 'COUPON_CODE_TAKEN', message: 'A coupon with this code already exists' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'coupon.create',
      targetType: 'Coupon',
      targetId: coupon.id,
      metadata: {
        code: coupon.code,
        discountType: coupon.discountType,
        percentOff: coupon.percentOff,
        amountOff: coupon.amountOff,
        billingCycle: coupon.billingCycle,
        maxRedemptions: coupon.maxRedemptions,
        expiresAt: coupon.expiresAt,
      },
    });

    return NextResponse.json(
      { coupon },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
