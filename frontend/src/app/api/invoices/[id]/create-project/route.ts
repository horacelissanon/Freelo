// Devis → Project conversion, once a client has accepted the quote. Mirrors
// credit-note/route.ts's shape: ownership check → business guards → create
// the new resource AND mutate the original inside one $transaction so the
// two rows never disagree (a Project can't exist without the Invoice
// pointing at it, or vice versa).
//
// `clientId` is deliberately absent from the request body — the resulting
// project always belongs to whichever client actually validated this devis,
// derived server-side from the Invoice row itself, never trusted from the
// caller.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { createProject } from '@/lib/server/projects/createProject';
import { theoreticalDepositAmount } from '@/lib/server/projects/depositBalance';
import { getOrCreateSubscription, isProActive } from '@/lib/server/billing/subscription';
import { getPlanConfig } from '@/lib/server/billing/plans';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { PROJECT_TYPE_VALUES, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import {
  getDefaultCurrency,
  exchangeRateValidationError,
} from '@/lib/server/fx/validateExchangeRate';

const PAYMENT_METHOD_VALUES = Object.keys(PAYMENT_METHOD_LABELS) as [string, ...string[]];

const Body = z
  .object({
    name: z.string().min(1).max(200),
    sector: z.string().min(1).max(100).default('OTHER'),
    type: z.enum(PROJECT_TYPE_VALUES).default('OTHER'),
    description: z.string().max(2000).optional(),
    amount: z.number().int().positive(),
    currency: z.string().length(3).default('XOF'),
    exchangeRateToDefault: z.number().positive().nullable().optional(),
    dueDate: z.string().datetime().optional(),
    steps: z
      .array(
        z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(500).optional(),
        }),
      )
      .min(1)
      .max(20)
      .optional(),
    // Deposit terms for the resulting project — what's expected going
    // forward. Mirrors InvoicePack's depositType/depositValue; omitted ->
    // schema default (PERCENT, 50).
    depositType: z.enum(['NONE', 'FIXED', 'PERCENT']).optional(),
    depositValue: z.number().int().nonnegative().optional(),
    // Confirms the devis's acompte was actually received before the project
    // is created — when true, a PAID Order row is recorded alongside the
    // project so the existing deposit/balance derivation (GET
    // /api/projects/[id], GET /api/track/[token]) shows it as paid on both
    // the freelance dashboard and the client-facing tracking page, with no
    // changes needed to that derivation logic.
    depositReceived: z.boolean().optional(),
    // The amount actually received — freelance-editable so a partial acompte
    // (client only paid part of the estimated deposit) is recorded
    // accurately instead of always assuming the full theoretical share.
    depositAmount: z.number().int().positive().optional(),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
    // Free-text detail — required when paymentMethod is the 'OTHER' catch-all
    // (the freelance's payment method buttons only cover the fixed list;
    // this lets them note what the client actually used instead).
    paymentMethodLabel: z.string().min(1).max(100).optional(),
  })
  .refine(
    (data) =>
      data.depositType !== 'PERCENT' ||
      data.depositValue == null ||
      (data.depositValue >= 0 && data.depositValue <= 100),
    {
      message: 'depositValue must be between 0 and 100 for a PERCENT deposit.',
      path: ['depositValue'],
    },
  )
  .refine(
    (data) =>
      data.depositType !== 'FIXED' || data.depositValue == null || data.depositValue <= data.amount,
    {
      message: "L'acompte fixe ne peut pas dépasser le montant du projet.",
      path: ['depositValue'],
    },
  )
  .refine((data) => !data.depositReceived || !!data.paymentMethod, {
    message: 'paymentMethod is required when depositReceived is true',
    path: ['paymentMethod'],
  })
  .refine((data) => !data.depositReceived || data.depositAmount != null, {
    message: 'depositAmount is required when depositReceived is true',
    path: ['depositAmount'],
  })
  .refine((data) => data.depositAmount == null || data.depositAmount <= data.amount, {
    message: "L'acompte ne peut pas dépasser le montant du projet.",
    path: ['depositAmount'],
  })
  .refine((data) => data.paymentMethod !== 'OTHER' || !!data.paymentMethodLabel, {
    message: 'paymentMethodLabel is required when paymentMethod is OTHER',
    path: ['paymentMethodLabel'],
  });

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true, clientId: true, docType: true, status: true, projectId: true },
    });
    if (!invoice) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND', message: 'Invoice does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (invoice.docType !== 'QUOTE') {
      return NextResponse.json(
        { error: 'NOT_A_QUOTE', message: 'Seul un devis peut être converti en projet.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (invoice.status !== 'ACCEPTED') {
      return NextResponse.json(
        {
          error: 'QUOTE_NOT_ACCEPTED',
          message: 'Le devis doit être accepté par le client avant de créer un projet.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (invoice.projectId) {
      return NextResponse.json(
        { error: 'PROJECT_ALREADY_EXISTS', message: 'Un projet est déjà rattaché à ce devis.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const defaultCurrency = await getDefaultCurrency(prisma, auth.user.sub);
    const rateError = exchangeRateValidationError(
      parsed.data.currency,
      defaultCurrency,
      parsed.data.exchangeRateToDefault,
      reqCtx.requestId,
    );
    if (rateError) return rateError;

    const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
    if (!isProActive(subscription)) {
      if (parsed.data.currency !== 'XOF') {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_CURRENCY',
            message: 'Le plan Gratuit ne permet que la devise XOF. Passe en Pro pour EUR/USD.',
          },
          { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      const freeConfig = await getPlanConfig(prisma, 'FREE');
      const maxActiveProjects = freeConfig.maxActiveProjects ?? Infinity;
      const activeProjectCount = await prisma.project.count({
        where: { userId: auth.user.sub, status: { notIn: ['DELIVERED', 'DRAFT'] } },
      });
      if (activeProjectCount >= maxActiveProjects) {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_PROJECTS',
            message: `Le plan Gratuit est limité à ${maxActiveProjects} projets actifs. Passe en Pro pour en créer davantage.`,
          },
          { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await createProject(tx, {
        userId: auth.user.sub,
        clientId: invoice.clientId,
        name: parsed.data.name,
        sector: parsed.data.sector,
        type: parsed.data.type,
        // Always PENDING — status is fully derived from step completion.
        status: 'PENDING',
        progress: 0,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        exchangeRateToDefault: parsed.data.exchangeRateToDefault ?? null,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        ...(parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {}),
        ...(parsed.data.steps ? { steps: parsed.data.steps } : {}),
        ...(parsed.data.depositType ? { depositType: parsed.data.depositType } : {}),
        ...(parsed.data.depositValue != null ? { depositValue: parsed.data.depositValue } : {}),
      });
      await tx.invoice.update({ where: { id: invoice.id }, data: { projectId: created.id } });
      if (parsed.data.depositReceived && parsed.data.paymentMethod) {
        const depositAmount = parsed.data.depositAmount ?? theoreticalDepositAmount(created);
        await tx.order.create({
          data: {
            userId: auth.user.sub,
            amount: depositAmount,
            currency: created.currency,
            status: 'PAID',
            provider: 'manual',
            paymentMethod: parsed.data.paymentMethod,
            metadata: {
              projectId: created.id,
              docType: 'DEPOSIT',
              ...(parsed.data.paymentMethod === 'OTHER' && parsed.data.paymentMethodLabel
                ? { paymentMethodLabel: parsed.data.paymentMethodLabel }
                : {}),
            },
            expiresAt: new Date(),
            paidAt: new Date(),
          },
        });
      }
      return created;
    });

    return NextResponse.json(project, {
      status: 201,
      headers: { 'x-request-id': reqCtx.requestId },
    });
  });
}
