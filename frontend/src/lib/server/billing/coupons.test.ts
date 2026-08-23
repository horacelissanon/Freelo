// Coupon validation + discount math — shared by GET /api/coupons/validate
// and POST /api/billing/subscribe so both routes apply the exact same
// rules (see coupons.ts header for why the client type is narrowed to
// Pick<PrismaClient, 'coupon' | 'couponRedemption'>).
import { describe, it, expect, vi } from 'vitest';
import { applyDiscount, normalizeCouponCode, validateCoupon, type CouponClient } from './coupons';

function makeClient(overrides: { coupon?: unknown; redemption?: unknown }): CouponClient {
  return {
    coupon: { findUnique: vi.fn().mockResolvedValue(overrides.coupon ?? null) },
    couponRedemption: { findUnique: vi.fn().mockResolvedValue(overrides.redemption ?? null) },
  } as unknown as CouponClient;
}

const activeCoupon = {
  id: 'coupon_1',
  code: 'SAVE10',
  discountType: 'PERCENT',
  percentOff: 10,
  amountOff: null,
  billingCycle: null,
  maxRedemptions: null,
  active: true,
  expiresAt: null,
  redemptionCount: 0,
};

describe('applyDiscount', () => {
  it('applies a flat percentage off an integer amount', () => {
    expect(applyDiscount(3500, { discountType: 'PERCENT', percentOff: 10, amountOff: null })).toBe(
      3150,
    );
  });

  it('rounds to the nearest integer (smallest currency unit)', () => {
    expect(applyDiscount(100, { discountType: 'PERCENT', percentOff: 33, amountOff: null })).toBe(
      67,
    );
  });

  it('returns the full amount unchanged for 0% off', () => {
    expect(applyDiscount(3500, { discountType: 'PERCENT', percentOff: 0, amountOff: null })).toBe(
      3500,
    );
  });

  it('subtracts a flat amount off', () => {
    expect(applyDiscount(3500, { discountType: 'AMOUNT', percentOff: null, amountOff: 500 })).toBe(
      3000,
    );
  });

  it('floors a flat amount discount at 0 (never goes negative)', () => {
    expect(applyDiscount(300, { discountType: 'AMOUNT', percentOff: null, amountOff: 500 })).toBe(
      0,
    );
  });
});

describe('normalizeCouponCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCouponCode(' save10 ')).toBe('SAVE10');
  });
});

describe('validateCoupon', () => {
  it('looks up the normalized (uppercase) code', async () => {
    const client = makeClient({ coupon: activeCoupon });
    await validateCoupon(client, ' save10 ', 'user_1');
    expect(client.coupon.findUnique).toHaveBeenCalledWith({ where: { code: 'SAVE10' } });
  });

  it('returns COUPON_NOT_FOUND for an unknown code', async () => {
    const client = makeClient({ coupon: null });
    const result = await validateCoupon(client, 'MISSING', 'user_1');
    expect(result).toEqual({ ok: false, code: 'COUPON_NOT_FOUND' });
  });

  it('returns COUPON_INACTIVE for a deactivated coupon', async () => {
    const client = makeClient({ coupon: { ...activeCoupon, active: false } });
    const result = await validateCoupon(client, 'SAVE10', 'user_1');
    expect(result).toEqual({ ok: false, code: 'COUPON_INACTIVE' });
  });

  it('returns COUPON_EXPIRED when expiresAt is in the past', async () => {
    const client = makeClient({
      coupon: { ...activeCoupon, expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    const result = await validateCoupon(client, 'SAVE10', 'user_1');
    expect(result).toEqual({ ok: false, code: 'COUPON_EXPIRED' });
  });

  it('accepts a coupon whose expiresAt is in the future', async () => {
    const client = makeClient({
      coupon: { ...activeCoupon, expiresAt: new Date('2099-01-01T00:00:00.000Z') },
    });
    const result = await validateCoupon(client, 'SAVE10', 'user_1');
    expect(result.ok).toBe(true);
  });

  it('returns COUPON_LIMIT_REACHED when redemptionCount has hit maxRedemptions', async () => {
    const client = makeClient({
      coupon: { ...activeCoupon, maxRedemptions: 5, redemptionCount: 5 },
    });
    const result = await validateCoupon(client, 'SAVE10', 'user_1');
    expect(result).toEqual({ ok: false, code: 'COUPON_LIMIT_REACHED' });
  });

  it('accepts a coupon still under its maxRedemptions cap', async () => {
    const client = makeClient({
      coupon: { ...activeCoupon, maxRedemptions: 5, redemptionCount: 4 },
    });
    const result = await validateCoupon(client, 'SAVE10', 'user_1');
    expect(result.ok).toBe(true);
  });

  it('returns COUPON_ALREADY_USED when this user already redeemed it', async () => {
    const client = makeClient({
      coupon: activeCoupon,
      redemption: { id: 'redemption_1', couponId: 'coupon_1', userId: 'user_1' },
    });
    const result = await validateCoupon(client, 'SAVE10', 'user_1');
    expect(result).toEqual({ ok: false, code: 'COUPON_ALREADY_USED' });
    expect(client.couponRedemption.findUnique).toHaveBeenCalledWith({
      where: { couponId_userId: { couponId: 'coupon_1', userId: 'user_1' } },
    });
  });

  it('returns the coupon info for a valid, unredeemed percent coupon', async () => {
    const client = makeClient({ coupon: activeCoupon });
    const result = await validateCoupon(client, 'SAVE10', 'user_1');
    expect(result).toEqual({
      ok: true,
      coupon: {
        id: 'coupon_1',
        code: 'SAVE10',
        discountType: 'PERCENT',
        percentOff: 10,
        amountOff: null,
        billingCycle: null,
      },
    });
  });

  it('returns the coupon info for a valid, unredeemed amount coupon', async () => {
    const client = makeClient({
      coupon: { ...activeCoupon, discountType: 'AMOUNT', percentOff: null, amountOff: 500 },
    });
    const result = await validateCoupon(client, 'SAVE10', 'user_1');
    expect(result).toEqual({
      ok: true,
      coupon: {
        id: 'coupon_1',
        code: 'SAVE10',
        discountType: 'AMOUNT',
        percentOff: null,
        amountOff: 500,
        billingCycle: null,
      },
    });
  });

  describe('billingCycle scoping', () => {
    it('a cycle-agnostic coupon (billingCycle: null) passes with no billingCycle arg (preview)', async () => {
      const client = makeClient({ coupon: activeCoupon });
      const result = await validateCoupon(client, 'SAVE10', 'user_1');
      expect(result.ok).toBe(true);
    });

    it('a MONTHLY-only coupon passes when billingCycle=MONTHLY is passed', async () => {
      const client = makeClient({ coupon: { ...activeCoupon, billingCycle: 'MONTHLY' } });
      const result = await validateCoupon(client, 'SAVE10', 'user_1', 'MONTHLY');
      expect(result.ok).toBe(true);
    });

    it('a MONTHLY-only coupon returns COUPON_WRONG_CYCLE when billingCycle=YEARLY is passed', async () => {
      const client = makeClient({ coupon: { ...activeCoupon, billingCycle: 'MONTHLY' } });
      const result = await validateCoupon(client, 'SAVE10', 'user_1', 'YEARLY');
      expect(result).toEqual({ ok: false, code: 'COUPON_WRONG_CYCLE' });
    });

    it('a MONTHLY-only coupon still validates fine when no billingCycle is passed (preview, not authoritative)', async () => {
      const client = makeClient({ coupon: { ...activeCoupon, billingCycle: 'MONTHLY' } });
      const result = await validateCoupon(client, 'SAVE10', 'user_1');
      expect(result.ok).toBe(true);
    });
  });
});
