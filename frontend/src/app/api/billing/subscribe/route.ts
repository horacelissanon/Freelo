// POST /api/billing/subscribe — start (or renew) the Merrudit Pro
// subscription via FedaPay. Mirrors /api/orders' Idempotency-Key +
// CircuitBreaker + PENDING-row-then-charge pattern, adapted for a
// SubscriptionTransaction instead of an Order. FedaPay has no silent
// recharge — the client MUST complete the returned `paymentUrl` checkout;
// this route only starts that flow and returns 201 on success (payment
// confirmation itself arrives async via /api/webhooks/fedapay).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { CircuitOpenError } from '@/lib/server/payments/circuit-breaker';
import { createTransaction } from '@/lib/server/payments/fedapay';
import {
  fedapayBreaker,
  getFedapayCredentials,
  FedapayProviderUnconfiguredError,
} from '@/lib/server/payments/fedapay-singleton';
import { getOrCreateSubscription, computeNextPeriodEnd } from '@/lib/server/billing/subscription';
import { getPlanConfig } from '@/lib/server/billing/plans';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const IDEM_KEY_MAX_LEN = 200;

const Body = z.object({
  billingCycle: z.enum(['MONTHLY', 'YEARLY']),
});

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
    const { billingCycle } = parsed.data;

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

    let credentials;
    try {
      credentials = getFedapayCredentials();
    } catch (err) {
      if (err instanceof FedapayProviderUnconfiguredError) {
        return NextResponse.json(
          { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'FedaPay not configured' },
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
          message: 'PUBLIC_URL not set; cannot construct the FedaPay callback URL.',
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
    const amount = billingCycle === 'MONTHLY' ? proConfig.monthlyAmount : proConfig.yearlyAmount;
    if (amount === null) {
      return NextResponse.json(
        { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Pro pricing is not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const currency = proConfig.currency;
    const periodEnd = computeNextPeriodEnd(billingCycle, subscription.currentPeriodEnd);
    const periodStart = subscription.currentPeriodEnd ?? new Date();

    const transaction = await prisma.subscriptionTransaction.create({
      data: {
        subscriptionId: subscription.id,
        amount,
        currency,
        billingCycle,
        status: 'PENDING',
        provider: 'fedapay',
        idempotencyKey: idemKey,
        periodStart,
        periodEnd,
      },
    });

    try {
      const result = await fedapayBreaker.execute(() =>
        createTransaction(credentials, {
          amount,
          currency,
          description: `Merrudit Pro — ${billingCycle === 'MONTHLY' ? 'mensuel' : 'annuel'}`,
          callbackUrl: `${publicUrl}/settings?tab=abonnement`,
          customer: {
            email: user.email,
            ...(user.name ? { firstName: user.name } : {}),
            ...(user.phone ? { phone: user.phone } : {}),
          },
        }),
      );

      if (!result.ok) {
        await prisma.subscriptionTransaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' },
        });
        return NextResponse.json(
          { error: 'PAYMENT_FAILED', message: result.error },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      await prisma.subscriptionTransaction.update({
        where: { id: transaction.id },
        data: { providerTransactionId: result.transactionId, paymentUrl: result.paymentUrl },
      });

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
        const retryAfterSec = Math.max(1, Math.ceil((err.retryAt.getTime() - Date.now()) / 1000));
        return NextResponse.json(
          {
            error: 'PAYMENT_PROVIDER_UNAVAILABLE',
            message: 'FedaPay temporarily unavailable. Try again shortly.',
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
