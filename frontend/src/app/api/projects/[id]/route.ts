// Freelance CRM — single-project detail (Phase A follow-up, same 404 gap as
// clients/[id]). Deposit/balance derivation mirrors GET /api/track/[token]'s
// project branch exactly (PAID Orders tagged via `metadata.projectId`) so the
// authenticated dashboard view and the public Client Link Portal never
// disagree on payment status.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeDepositBalance } from '@/lib/server/projects/depositBalance';
import {
  getOrCreateSubscription,
  isProActive,
  FREE_PLAN_LIMITS,
} from '@/lib/server/billing/subscription';
import { PROJECT_TYPE_VALUES, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import {
  getDefaultCurrency,
  exchangeRateValidationError,
} from '@/lib/server/fx/validateExchangeRate';

const PAYMENT_METHOD_VALUES = Object.keys(PAYMENT_METHOD_LABELS) as [string, ...string[]];

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  sector: z.string().min(1).max(100).optional(),
  type: z.enum(PROJECT_TYPE_VALUES).optional(),
  description: z.string().max(2000).nullable().optional(),
  amount: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  exchangeRateToDefault: z.number().positive().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  // "Enregistrer brouillon" vs "Créer projet" — only meaningful while the
  // project is still DRAFT (guarded below). Once PENDING+, status is fully
  // derived from step completion (see lib/server/projects/progress.ts) and
  // this field is rejected.
  status: z.enum(['DRAFT', 'PENDING']).optional(),
  // DRAFT-only bulk fields, all guarded below — a real (PENDING+) project
  // never accepts these; only the light field set above stays patchable.
  clientId: z.string().min(1).optional(),
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
  depositType: z.enum(['NONE', 'FIXED', 'PERCENT']).optional(),
  depositValue: z.number().int().nonnegative().optional(),
  depositReceived: z.boolean().optional(),
  depositAmount: z.number().int().positive().optional(),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
  paymentMethodLabel: z.string().min(1).max(100).optional(),
});

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const project = await prisma.project.findFirst({
      where: { id, userId: auth.user.sub },
      include: {
        client: { select: { id: true, name: true, trackingToken: true } },
        steps: { orderBy: { order: 'asc' } },
        comments: { orderBy: { createdAt: 'asc' } },
        review: { select: { rating: true, comment: true, createdAt: true } },
        invoices: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            number: true,
            docType: true,
            status: true,
            amount: true,
            currency: true,
            dueDate: true,
          },
        },
        files: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            url: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'PROJECT_NOT_FOUND', message: 'Project does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { deposit, balance } = await computeDepositBalance(prisma, project);

    const { steps, comments, review, invoices, files, ...projectFields } = project;
    return NextResponse.json(
      {
        project: projectFields,
        steps,
        comments,
        review: review ?? null,
        invoices,
        files,
        deposit,
        balance,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function PATCH(
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

    const existing = await prisma.project.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'PROJECT_NOT_FOUND', message: 'Project does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
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
    const {
      name,
      sector,
      type,
      description,
      amount,
      currency,
      exchangeRateToDefault,
      dueDate,
      status,
      clientId,
      steps,
      depositType,
      depositValue,
      depositReceived,
      depositAmount,
      paymentMethod,
      paymentMethodLabel,
    } = parsed.data;

    // Full content (client/currency/steps/deposit terms/status) only stays
    // reachable while the project is still a DRAFT — mirrors the devis/
    // facture content-freeze pattern (see invoices/[id]/route.ts). Once
    // PENDING+, only the light field set (name/sector/type/description/
    // amount/dueDate) remains patchable.
    if (
      existing.status !== 'DRAFT' &&
      (status !== undefined ||
        clientId !== undefined ||
        steps !== undefined ||
        currency !== undefined ||
        exchangeRateToDefault !== undefined ||
        depositType !== undefined ||
        depositValue !== undefined ||
        depositReceived !== undefined ||
        depositAmount !== undefined ||
        paymentMethod !== undefined ||
        paymentMethodLabel !== undefined)
    ) {
      return NextResponse.json(
        {
          error: 'PROJECT_NOT_DRAFT',
          message:
            'Seul un brouillon peut avoir son client, ses étapes ou son acompte modifiés — un projet déjà créé ne garde que ses champs simples éditables.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (clientId !== undefined) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, userId: auth.user.sub },
        select: { id: true },
      });
      if (!client) {
        return NextResponse.json(
          { error: 'CLIENT_NOT_FOUND', message: 'Client does not exist or does not belong to you' },
          { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    if (currency !== undefined) {
      const defaultCurrency = await getDefaultCurrency(prisma, auth.user.sub);
      const rateError = exchangeRateValidationError(
        currency,
        defaultCurrency,
        exchangeRateToDefault,
        reqCtx.requestId,
      );
      if (rateError) return rateError;
    }

    // Same free-plan gate as POST /api/projects — only enforced when
    // actually finalizing (DRAFT -> PENDING), never for re-saving a draft.
    if (status === 'PENDING') {
      const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
      if (!isProActive(subscription)) {
        const activeProjectCount = await prisma.project.count({
          where: { userId: auth.user.sub, status: { notIn: ['DELIVERED', 'DRAFT'] } },
        });
        if (activeProjectCount >= FREE_PLAN_LIMITS.maxActiveProjects) {
          return NextResponse.json(
            {
              error: 'PLAN_LIMIT_PROJECTS',
              message: `Le plan Gratuit est limité à ${FREE_PLAN_LIMITS.maxActiveProjects} projets actifs. Passe en Pro pour en créer davantage.`,
            },
            { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
          );
        }
      }
    }

    const updateData = {
      ...(name !== undefined ? { name } : {}),
      ...(sector !== undefined ? { sector } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(currency !== undefined ? { currency } : {}),
      ...(exchangeRateToDefault !== undefined ? { exchangeRateToDefault } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(clientId !== undefined ? { clientId } : {}),
      ...(depositType !== undefined ? { depositType } : {}),
      ...(depositValue !== undefined ? { depositValue } : {}),
    };

    const project = await prisma.$transaction(async (tx) => {
      if (steps !== undefined) {
        await tx.projectStep.deleteMany({ where: { projectId: id } });
        await tx.projectStep.createMany({
          data: steps.map((s, i) => ({
            projectId: id,
            order: i + 1,
            title: s.title,
            ...(s.description ? { description: s.description } : {}),
          })),
        });
      }
      const updated = await tx.project.update({ where: { id }, data: updateData });
      if (depositReceived && paymentMethod && depositAmount != null) {
        await tx.order.create({
          data: {
            userId: auth.user.sub,
            amount: depositAmount,
            currency: updated.currency,
            status: 'PAID',
            provider: 'manual',
            paymentMethod,
            metadata: {
              projectId: updated.id,
              docType: 'DEPOSIT',
              ...(paymentMethod === 'OTHER' && paymentMethodLabel ? { paymentMethodLabel } : {}),
            },
            expiresAt: new Date(),
            paidAt: new Date(),
          },
        });
      }
      return updated;
    });

    return NextResponse.json(project, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
