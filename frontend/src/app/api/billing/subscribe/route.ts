// POST /api/billing/subscribe — start (or renew) the ZeFacto Pro
// subscription via SasPay. Mirrors /api/orders' Idempotency-Key +
// CircuitBreaker + PENDING-row-then-charge pattern, adapted for a
// SubscriptionTransaction instead of an Order — same provider singleton
// and shared CircuitBreaker as /api/orders and /api/track/[token]/pay
// (same downstream SasPay API, same failure domain). SasPay has no silent
// recharge — the client MUST complete the returned `paymentUrl` checkout;
// this route only starts that flow and returns 201 on success (payment
// confirmation itself arrives async via /api/webhooks/saspay).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { CircuitOpenError } from '@/lib/server/payments/circuit-breaker';
import {
  breaker,
  getProvider,
  PaymentProviderUnconfiguredError,
} from '@/lib/server/payments/provider-singleton';
import { createAdminAlert } from '@/lib/server/admin-alerts';
import { circuitOpen } from '@/lib/server/admin-alerts/templates';
import { getOrCreateSubscription, computeNextPeriodEnd } from '@/lib/server/billing/subscription';
import { getPlanConfig } from '@/lib/server/billing/plans';
import { validateCoupon, applyDiscount, type CouponErrorCode } from '@/lib/server/billing/coupons';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const IDEM_KEY_MAX_LEN = 200;

const Body = z.object({
  billingCycle: z.enum(['MONTHLY', 'YEARLY']),
  couponCode: z.string().trim().min(1).max(30).optional(),
});

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const idemKey = req.headers.get('idempotency-key') ?? '';
    if (!idemKey) {
      return NextResponse.json(
        { error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key header required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (idemKey.length > IDEM_KEY_MAX_LEN) {
      return NextResponse.json(
        {
          error: 'IDEMPOTENCY_KEY_INVALID',
          message: `Idempotency-Key exceeds ${IDEM_KEY_MAX_LEN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { billingCycle, couponCode } = parsed.data;

    const existing = await prisma.subscriptionTransaction.findUnique({
      where: { idempotencyKey: idemKey },
    });
    if (existing) {
      if (existing.status === 'PENDING' && !existing.paymentUrl) {
        return NextResponse.json(
          { error: 'PAYMENT_IN_FLIGHT', message: 'Prior attempt did not complete; retry shortly.' },
          { status: 503, headers: { 'x-request-id': ctx.requestId, 'Retry-After': '5' } },
        );
      }
      if (existing.status === 'PENDING' || existing.status === 'PAID') {
        return NextResponse.json(
          { id: existing.id, paymentUrl: existing.paymentUrl, status: existing.status },
          { status: 200, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        {
          error: 'PAYMENT_PROVIDER_UNAVAILABLE',
          message:
            'A previous attempt with this Idempotency-Key did not complete; submit a new key to retry.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let provider;
    try {
      provider = getProvider();
    } catch (err) {
      if (err instanceof PaymentProviderUnconfiguredError) {
        return NextResponse.json(
          { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    const envPublicUrl = process.env.PUBLIC_URL;
    if (!envPublicUrl && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'PAYMENT_PROVIDER_UNCONFIGURED',
          message: 'PUBLIC_URL not set; cannot construct success/failure redirect URLs.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const publicUrl = envPublicUrl ?? 'http://localhost:3000';

    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { email: true, name: true, phone: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
    const proConfig = await getPlanConfig(prisma, 'PRO');
    const baseAmount =
      billingCycle === 'MONTHLY' ? proConfig.monthlyAmount : proConfig.yearlyAmount;
    if (baseAmount === null) {
      return NextResponse.json(
        { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Pro pricing is not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const currency = proConfig.currency;

    // Server-side re-check — the client's GET /api/coupons/validate call is
    // only a preview; this is the authoritative validation before charging.
    let appliedCoupon: { id: string; code: string } | null = null;
    let amount = baseAmount;
    if (couponCode) {
      const couponResult = await validateCoupon(prisma, couponCode, auth.user.sub, billingCycle);
      if (!couponResult.ok) {
        return NextResponse.json(
          { error: couponResult.code, message: COUPON_ERROR_MESSAGE[couponResult.code] },
          {
            status: COUPON_ERROR_STATUS[couponResult.code],
            headers: { 'x-request-id': ctx.requestId },
          },
        );
      }
      appliedCoupon = { id: couponResult.coupon.id, code: couponResult.coupon.code };
      amount = applyDiscount(baseAmount, couponResult.coupon);
    }
    const periodEnd = computeNextPeriodEnd(billingCycle, subscription.currentPeriodEnd);
    const periodStart = subscription.currentPeriodEnd ?? new Date();

    const transaction = await prisma.subscriptionTransaction.create({
      data: {
        subscriptionId: subscription.id,
        amount,
        currency,
        billingCycle,
        status: 'PENDING',
        provider: 'saspay',
        idempotencyKey: idemKey,
        periodStart,
        periodEnd,
        couponCode: appliedCoupon?.code ?? null,
        // Matches SasPay's own checkout-session lifetime (observed live:
        // expires exactly 1h after creation) — swept by the
        // subscription-transaction-expiration cron.
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    try {
      const result = await breaker.execute(() =>
        provider.charge({
          amount,
          currency,
          metadata: {
            description: `ZeFacto Pro — ${billingCycle === 'MONTHLY' ? 'mensuel' : 'annuel'}`,
          },
          customer: {
            email: user.email,
            ...(user.name ? { name: user.name } : {}),
            ...(user.phone ? { phone: user.phone } : {}),
          },
          successUrl: `${publicUrl}/settings?tab=abonnement`,
          failureUrl: `${publicUrl}/settings?tab=abonnement`,
          externalRef: transaction.id,
        }),
      );

      await prisma.subscriptionTransaction.update({
        where: { id: transaction.id },
        data: { providerTransactionId: result.providerChargeId, paymentUrl: result.paymentUrl },
      });

      // Reserve the redemption only now that checkout genuinely exists —
      // reserving it earlier would burn the user's one-time coupon on a
      // SasPay/network failure they didn't cause. The (couponId, userId)
      // unique constraint is the real guard against a double-submit race;
      // a failure here is non-fatal (the checkout link is already valid
      // and must still be honored) so it's swallowed, not thrown.
      if (appliedCoupon) {
        try {
          await prisma.$transaction([
            prisma.couponRedemption.create({
              data: { couponId: appliedCoupon.id, userId: auth.user.sub },
            }),
            prisma.coupon.update({
              where: { id: appliedCoupon.id },
              data: { redemptionCount: { increment: 1 } },
            }),
          ]);
        } catch (redemptionErr) {
          log.warn('coupon redemption bookkeeping failed — checkout proceeds anyway', {
            userId: auth.user.sub,
            couponId: appliedCoupon.id,
            error: redemptionErr instanceof Error ? redemptionErr.message : String(redemptionErr),
          });
        }
      }

      return NextResponse.json(
        { id: transaction.id, paymentUrl: result.paymentUrl, status: 'PENDING' },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        await prisma.subscriptionTransaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' },
        });
        try {
          const bucket15min = Math.floor(Date.now() / (15 * 60_000)).toString();
          await createAdminAlert(
            prisma,
            circuitOpen(breaker.name, bucket15min, err.retryAt.toISOString()),
          );
        } catch {
          // Never let alerting affect the payment-provider-unavailable response.
        }
        const retryAfterSec = Math.max(1, Math.ceil((err.retryAt.getTime() - Date.now()) / 1000));
        return NextResponse.json(
          {
            error: 'PAYMENT_PROVIDER_UNAVAILABLE',
            message: 'Payment provider temporarily unavailable. Try again shortly.',
          },
          {
            status: 503,
            headers: { 'x-request-id': ctx.requestId, 'Retry-After': String(retryAfterSec) },
          },
        );
      }
      await prisma.subscriptionTransaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });
      const message = err instanceof Error ? err.message : 'Unknown payment error';
      return NextResponse.json(
        { error: 'PAYMENT_FAILED', message },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
