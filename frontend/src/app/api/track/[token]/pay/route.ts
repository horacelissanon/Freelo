// Public, unauthenticated deposit/balance payment on the Client Link Portal
// (Phase C). This is a DELIBERATE, narrow exception to the "no guest
// checkout" rule that POST /api/orders enforces (D-PAY-03 there): the
// project's `publicToken` IS the authorization, and — critically — the
// amount charged is ALWAYS computed server-side from `project.amount` +
// `project.depositType`/`depositValue`. The client can choose WHICH bucket to pay
// (DEPOSIT or BALANCE) but never HOW MUCH. Reuses the same lazy provider
// singleton + CircuitBreaker + Idempotency-Key replay semantics as
// /api/orders so it inherits the same safety properties.
export const runtime = 'nodejs';

import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { CircuitOpenError } from '@/lib/server/payments/circuit-breaker';
import {
  breaker,
  getProvider,
  PaymentProviderUnconfiguredError,
} from '@/lib/server/payments/provider-singleton';
import { enforceTokenRateLimit } from '@/lib/server/middleware/rate-limit-by-token';
import { isProActive } from '@/lib/server/billing/subscription';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeDepositBalance } from '@/lib/server/projects/depositBalance';

const Body = z.object({
  kind: z.enum(['DEPOSIT', 'BALANCE']),
});

const IDEM_KEY_MAX_LEN = 200;
const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_PREFIX = 'rl:track:pay:';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_HITS = 5;

function fingerprint(input: { projectId: string; kind: string }): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { token } = await ctx.params;

    const limited = await enforceTokenRateLimit(RATE_LIMIT_PREFIX, token, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxHits: RATE_LIMIT_MAX_HITS,
    });
    if (limited) return limited;

    const idemKey = req.headers.get('idempotency-key') ?? '';
    if (!idemKey) {
      return NextResponse.json(
        { error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key header required' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (idemKey.length > IDEM_KEY_MAX_LEN) {
      return NextResponse.json(
        {
          error: 'IDEMPOTENCY_KEY_INVALID',
          message: `Idempotency-Key exceeds ${IDEM_KEY_MAX_LEN} characters`,
        },
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
    const { kind } = parsed.data;

    const project = await prisma.project.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        amount: true,
        currency: true,
        depositType: true,
        depositValue: true,
        client: { select: { name: true, email: true, phone: true } },
        user: {
          select: {
            publicPortalEnabled: true,
            subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
          },
        },
      },
    });
    if (!project || !project.user.publicPortalEnabled) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Lien de suivi invalide ou expiré.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (
      !isProActive(
        project.user.subscription ?? { plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null },
      )
    ) {
      return NextResponse.json(
        {
          error: 'PLAN_REQUIRES_PRO',
          message: 'Le paiement en ligne est réservé aux freelances en plan Pro.',
        },
        { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Reads the real, possibly-partial acompte already recorded (e.g. via
    // the devis->projet flow) so the balance charged here is the true
    // remaining amount, not a fixed theoretical split that could over-
    // or under-charge the client if a manual entry already diverged from it.
    const { deposit, balance } = await computeDepositBalance(prisma, project);
    const amount = kind === 'DEPOSIT' ? deposit.amount : balance.amount;
    const alreadyPaid = kind === 'DEPOSIT' ? deposit.paid : balance.paid;
    if (alreadyPaid) {
      return NextResponse.json(
        { error: 'ALREADY_PAID', message: 'Ce montant a déjà été réglé.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (kind === 'BALANCE' && !deposit.paid) {
      return NextResponse.json(
        { error: 'DEPOSIT_REQUIRED', message: "L'acompte doit être réglé avant le solde." },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const bodyHash = fingerprint({ projectId: project.id, kind });
    const existing = await prisma.order.findUnique({ where: { idempotencyKey: idemKey } });
    if (existing) {
      const existingMeta = (existing.metadata ?? null) as { idempotencyBodyHash?: unknown } | null;
      const storedHash =
        existingMeta && typeof existingMeta.idempotencyBodyHash === 'string'
          ? existingMeta.idempotencyBodyHash
          : null;
      if (storedHash !== null && storedHash !== bodyHash) {
        return NextResponse.json(
          {
            error: 'IDEMPOTENCY_KEY_BODY_MISMATCH',
            message: 'Idempotency-Key already used for a different request.',
          },
          { status: 422, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      if (existing.status === 'PENDING' || existing.status === 'PAID') {
        if (existing.status === 'PENDING' && !existing.paymentUrl) {
          return NextResponse.json(
            {
              error: 'PAYMENT_IN_FLIGHT',
              message: 'Prior attempt did not complete; retry shortly.',
            },
            { status: 503, headers: { 'x-request-id': reqCtx.requestId, 'Retry-After': '5' } },
          );
        }
        return NextResponse.json(
          { id: existing.id, paymentUrl: existing.paymentUrl, status: existing.status },
          { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      return NextResponse.json(
        {
          error: 'PAYMENT_PROVIDER_UNAVAILABLE',
          message:
            'A previous attempt with this Idempotency-Key did not complete; submit a new key to retry.',
        },
        { status: 503, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    let provider;
    try {
      provider = getProvider();
    } catch (err) {
      if (err instanceof PaymentProviderUnconfiguredError) {
        return NextResponse.json(
          { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': reqCtx.requestId } },
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
        { status: 503, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const publicUrl = envPublicUrl ?? 'http://localhost:3000';

    const mergedMetadata: Prisma.InputJsonValue = {
      projectId: project.id,
      docType: kind,
      idempotencyBodyHash: bodyHash,
    };
    const order = await prisma.order.create({
      data: {
        userId: null,
        amount,
        currency: project.currency,
        provider: 'saspay',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS),
        idempotencyKey: idemKey,
        ...(project.client.email ? { customerEmail: project.client.email } : {}),
        ...(project.client.phone ? { customerPhone: project.client.phone } : {}),
        customerName: project.client.name,
        metadata: mergedMetadata,
      },
    });

    try {
      const result = await breaker.execute(() =>
        provider.charge({
          amount,
          currency: project.currency,
          customer: {
            ...(project.client.email ? { email: project.client.email } : {}),
            ...(project.client.phone ? { phone: project.client.phone } : {}),
            name: project.client.name,
          },
          successUrl: `${publicUrl}/suivi/${token}`,
          failureUrl: `${publicUrl}/suivi/${token}`,
          externalRef: order.id,
        }),
      );

      await prisma.order.update({
        where: { id: order.id },
        data: { providerChargeId: result.providerChargeId, paymentUrl: result.paymentUrl },
      });

      return NextResponse.json(
        { id: order.id, paymentUrl: result.paymentUrl, status: 'PENDING' },
        { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
      );
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
        const retryAfterSec = Math.max(1, Math.ceil((err.retryAt.getTime() - Date.now()) / 1000));
        return NextResponse.json(
          {
            error: 'PAYMENT_PROVIDER_UNAVAILABLE',
            message: 'Payment provider temporarily unavailable. Try again shortly.',
          },
          {
            status: 503,
            headers: { 'x-request-id': reqCtx.requestId, 'Retry-After': String(retryAfterSec) },
          },
        );
      }
      await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      const message = err instanceof Error ? err.message : 'Unknown payment error';
      return NextResponse.json(
        { error: 'PAYMENT_FAILED', message },
        { status: 502, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
  });
}
