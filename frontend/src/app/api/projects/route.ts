// Freelance CRM (Banani "Espace Freelance Merrudit" import, Phase A —
// see .planning/banani/IMPLEMENTATION-PLAN.md). GET list (cursor
// pagination) + POST create. `clientId` must belong to the caller —
// checked at create time so a user can't attach a project to someone
// else's client.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, decodeCursor, cursorWhere, buildPage } from '@/lib/server/pagination/paginate';
import {
  getOrCreateSubscription,
  isProActive,
  FREE_PLAN_LIMITS,
} from '@/lib/server/billing/subscription';
import { createProject } from '@/lib/server/projects/createProject';
import {
  getDefaultCurrency,
  exchangeRateValidationError,
} from '@/lib/server/fx/validateExchangeRate';
import { computeDepositBalanceBatch } from '@/lib/server/projects/depositBalance';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { PROJECT_TYPE_VALUES, PAYMENT_METHOD_LABELS } from '@/lib/constants';

const PAYMENT_METHOD_VALUES = Object.keys(PAYMENT_METHOD_LABELS) as [string, ...string[]];

const Body = z
  .object({
    clientId: z.string().min(1),
    name: z.string().min(1).max(200),
    sector: z.string().min(1).max(100).default('OTHER'),
    type: z.enum(PROJECT_TYPE_VALUES).default('OTHER'),
    // "Enregistrer brouillon" vs "Créer projet" — the only freelance-chosen
    // status value; PENDING+ is fully derived from step completion after
    // this point (see lib/server/projects/progress.ts).
    status: z.enum(['DRAFT', 'PENDING']).default('PENDING'),
    description: z.string().max(2000).optional(),
    progress: z.number().int().min(0).max(100).default(0),
    amount: z.number().int().positive(),
    currency: z.string().length(3).default('XOF'),
    exchangeRateToDefault: z.number().positive().nullable().optional(),
    dueDate: z.string().datetime().optional(),
    step: z.string().max(200).optional(),
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
    // Deposit terms for this project — what's expected going forward, not
    // what's already been paid (see depositReceived below). Mirrors
    // InvoicePack's depositType/depositValue; omitted -> schema default
    // (PERCENT, 50).
    depositType: z.enum(['NONE', 'FIXED', 'PERCENT']).optional(),
    depositValue: z.number().int().nonnegative().optional(),
    // Standalone creation's equivalent of the devis->projet flow's own
    // deposit-confirmation step (see POST /api/invoices/[id]/create-project)
    // — lets a freelance record an acompte already collected off-platform
    // instead of the project being stuck showing "unpaid" forever.
    depositReceived: z.boolean().optional(),
    depositAmount: z.number().int().positive().optional(),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const status = url.searchParams.get('status');
    const clientId = url.searchParams.get('clientId');

    // `?status=ACTIVE` is a pseudo-filter ("not delivered yet") rather than
    // an exact status match — used by widgets that want "still actionable"
    // regardless of which of the 3 non-final statuses a project is in.
    const statusFilter =
      status === 'ACTIVE'
        ? { status: { notIn: ['DELIVERED', 'DRAFT'] } }
        : status
          ? { status }
          : {};

    const where: Prisma.ProjectWhereInput = {
      userId: auth.user.sub,
      ...statusFilter,
      ...(clientId ? { clientId } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.project.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    const page = buildPage(rows, limit);
    // Acompte/solde visible on the list without opening each project — one
    // batched pair of queries for the whole page (see
    // computeDepositBalanceBatch's own comment for why this can't be a plain
    // `include`).
    const balances = await computeDepositBalanceBatch(prisma, page.items);
    const items = page.items.map((project) => {
      const balance = balances.get(project.id);
      return {
        ...project,
        deposit: balance?.deposit ?? { amount: 0, paid: false },
        balance: balance?.balance ?? { amount: 0, paid: false },
      };
    });

    return NextResponse.json({ ...page, items }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, userId: auth.user.sub },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND', message: 'Client does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const defaultCurrency = await getDefaultCurrency(prisma, auth.user.sub);
    const rateError = exchangeRateValidationError(
      parsed.data.currency,
      defaultCurrency,
      parsed.data.exchangeRateToDefault,
      ctx.requestId,
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
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      // A draft isn't a real commitment yet — only check the cap when
      // actually finalizing a project (status: PENDING).
      if (parsed.data.status === 'PENDING') {
        const activeProjectCount = await prisma.project.count({
          where: { userId: auth.user.sub, status: { notIn: ['DELIVERED', 'DRAFT'] } },
        });
        if (activeProjectCount >= FREE_PLAN_LIMITS.maxActiveProjects) {
          return NextResponse.json(
            {
              error: 'PLAN_LIMIT_PROJECTS',
              message: `Le plan Gratuit est limité à ${FREE_PLAN_LIMITS.maxActiveProjects} projets actifs. Passe en Pro pour en créer davantage.`,
            },
            { status: 403, headers: { 'x-request-id': ctx.requestId } },
          );
        }
      }
    }

    const createInput = {
      userId: auth.user.sub,
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      sector: parsed.data.sector,
      type: parsed.data.type,
      status: parsed.data.status,
      progress: parsed.data.progress,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      exchangeRateToDefault: parsed.data.exchangeRateToDefault ?? null,
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {}),
      ...(parsed.data.step ? { step: parsed.data.step } : {}),
      ...(parsed.data.steps ? { steps: parsed.data.steps } : {}),
      ...(parsed.data.depositType ? { depositType: parsed.data.depositType } : {}),
      ...(parsed.data.depositValue != null ? { depositValue: parsed.data.depositValue } : {}),
    };

    const { depositReceived, paymentMethod, depositAmount, paymentMethodLabel } = parsed.data;

    const project =
      depositReceived && paymentMethod && depositAmount != null
        ? await prisma.$transaction(async (tx) => {
            const created = await createProject(tx, createInput);
            await tx.order.create({
              data: {
                userId: auth.user.sub,
                amount: depositAmount,
                currency: created.currency,
                status: 'PAID',
                provider: 'manual',
                paymentMethod,
                metadata: {
                  projectId: created.id,
                  docType: 'DEPOSIT',
                  ...(paymentMethod === 'OTHER' && paymentMethodLabel
                    ? { paymentMethodLabel }
                    : {}),
                },
                expiresAt: new Date(),
                paidAt: new Date(),
              },
            });
            return created;
          })
        : await createProject(prisma, createInput);

    return NextResponse.json(project, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
