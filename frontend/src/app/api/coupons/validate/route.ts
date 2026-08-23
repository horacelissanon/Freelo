// GET /api/coupons/validate?code=XXX — Paramètres → Abonnement's coupon
// preview, called when the user clicks "Appliquer" before checkout. A GET
// (not a mutation) so no CSRF token is needed. This result is only a
// preview: POST /api/billing/subscribe re-validates the coupon itself
// before ever charging anything.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { validateCoupon, type CouponErrorCode } from '@/lib/server/billing/coupons';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const COUPON_ERROR_STATUS: Record<CouponErrorCode, number> = {
  COUPON_NOT_FOUND: 404,
  COUPON_INACTIVE: 400,
  COUPON_EXPIRED: 400,
  COUPON_LIMIT_REACHED: 409,
  COUPON_WRONG_CYCLE: 409,
  COUPON_ALREADY_USED: 409,
};

const COUPON_ERROR_MESSAGE: Record<CouponErrorCode, string> = {
  COUPON_NOT_FOUND: 'Ce code promo est introuvable.',
  COUPON_INACTIVE: "Ce code promo n'est plus actif.",
  COUPON_EXPIRED: 'Ce code promo a expiré.',
  COUPON_LIMIT_REACHED: "Ce code promo a atteint son nombre maximal d'utilisations.",
  COUPON_WRONG_CYCLE: "Ce code promo ne s'applique pas à ce cycle de facturation.",
  COUPON_ALREADY_USED: 'Tu as déjà utilisé ce code promo.',
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const code = req.nextUrl.searchParams.get('code');
    if (!code) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'code query param required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const result = await validateCoupon(prisma, code, auth.user.sub);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.code, message: COUPON_ERROR_MESSAGE[result.code] },
        { status: COUPON_ERROR_STATUS[result.code], headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        percentOff: result.coupon.percentOff,
        amountOff: result.coupon.amountOff,
        billingCycle: result.coupon.billingCycle,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
