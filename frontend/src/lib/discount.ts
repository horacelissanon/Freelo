// Discount math — shared by the server (lib/server/billing/coupons.ts, which
// re-exports this) and the client (FacturationTab.tsx's discounted-price
// preview). Kept dependency-free and free of 'server-only' so both sides can
// import it directly.
export interface DiscountCoupon {
  discountType: 'PERCENT' | 'AMOUNT';
  percentOff: number | null;
  amountOff: number | null;
}

export function applyDiscount(amount: number, coupon: DiscountCoupon): number {
  if (coupon.discountType === 'AMOUNT') {
    return Math.max(0, amount - (coupon.amountOff ?? 0));
  }
  return Math.round((amount * (100 - (coupon.percentOff ?? 0))) / 100);
}
