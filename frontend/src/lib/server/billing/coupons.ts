// Coupon validation + discount math for the Merrudit Pro checkout. Shared by
// GET /api/coupons/validate (client-side preview on the Abonnement page) and
// POST /api/billing/subscribe (authoritative re-check at charge time — the
// preview result is never trusted). `CouponClient` narrows PrismaClient to
// just the two models this module touches, mirroring admin/audit.ts's
// AuditClient pattern, so tests can pass a minimal stub instead of the full
// deep-mocked client.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export { applyDiscount, type DiscountCoupon } from '@/lib/discount';

export type CouponClient = Pick<PrismaClient, 'coupon' | 'couponRedemption'>;

export type CouponErrorCode =
  | 'COUPON_NOT_FOUND'
  | 'COUPON_INACTIVE'
  | 'COUPON_EXPIRED'
  | 'COUPON_LIMIT_REACHED'
  | 'COUPON_WRONG_CYCLE'
  | 'COUPON_ALREADY_USED';

export interface CouponInfo {
  id: string;
  code: string;
  discountType: 'PERCENT' | 'AMOUNT';
  percentOff: number | null;
  amountOff: number | null;
  billingCycle: 'MONTHLY' | 'YEARLY' | null;
}

export type CouponValidationResult =
  | { ok: true; coupon: CouponInfo }
  | { ok: false; code: CouponErrorCode };

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function validateCoupon(
  prisma: CouponClient,
  rawCode: string,
  userId: string,
  // Omitted for the client-side preview (GET /api/coupons/validate), which
  // doesn't ask the user to commit to a cycle before showing the code is
  // valid — see that route's header. Required (passed) at charge time
  // (POST /api/billing/subscribe), which is the only place this is
  // actually enforced.
  billingCycle?: 'MONTHLY' | 'YEARLY',
): Promise<CouponValidationResult> {
  const code = normalizeCouponCode(rawCode);
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon) return { ok: false, code: 'COUPON_NOT_FOUND' };
  if (!coupon.active) return { ok: false, code: 'COUPON_INACTIVE' };
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
    return { ok: false, code: 'COUPON_EXPIRED' };
  }
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { ok: false, code: 'COUPON_LIMIT_REACHED' };
  }
  if (billingCycle && coupon.billingCycle && coupon.billingCycle !== billingCycle) {
    return { ok: false, code: 'COUPON_WRONG_CYCLE' };
  }

  const redemption = await prisma.couponRedemption.findUnique({
    where: { couponId_userId: { couponId: coupon.id, userId } },
  });
  if (redemption) return { ok: false, code: 'COUPON_ALREADY_USED' };

  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType as 'PERCENT' | 'AMOUNT',
      percentOff: coupon.percentOff,
      amountOff: coupon.amountOff,
      billingCycle: coupon.billingCycle as 'MONTHLY' | 'YEARLY' | null,
    },
  };
}
