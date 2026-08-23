// Project → Invoice generation, so a freelance can bill a finalized/settled
// project without leaving its detail page. Mirrors invoices/[id]/
// create-project/route.ts's shape (ownership check → guards → derive
// clientId/projectId server-side, never trust the body) and reuses the same
// numbering pattern as the INVOICE branch of POST /api/invoices.
//
// Unlike the devis→project conversion, a Project already has a one-to-many
// `invoices` relation (no `@@unique` on Invoice.projectId) — issuing a
// deposit invoice then a balance invoice for the same project is the
// intended shape, so there's no "already has an invoice" 409 guard here.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getOrCreateSubscription, isProActive } from '@/lib/server/billing/subscription';
import { getPlanConfig } from '@/lib/server/billing/plans';
import { formatInvoiceNumber } from '@/lib/server/invoices/number';
import { computeItemsTotal } from '@/lib/invoiceTotals';
import { zPositiveInt } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  getDefaultCurrency,
  exchangeRateValidationError,
} from '@/lib/server/fx/validateExchangeRate';

const MAX_NUMBER_RETRIES = 3;

const LineItemInput = z.object({
  designation: z.string().min(1).max(200),
  quantity: zPositiveInt,
  unitPrice: zPositiveInt,
});

const Body = z.object({
  description: z.string().max(500).optional(),
  lineItems: z.array(LineItemInput).min(1).max(100),
  currency: z.string().length(3).default('XOF'),
  exchangeRateToDefault: z.number().positive().nullable().optional(),
  depositAmount: z.number().int().min(0).optional(),
  deliveryDate: z.string().datetime().optional(),
  paymentMethodNote: z.string().max(300).optional(),
  footerNote: z.string().max(1000).optional(),
  status: z.enum(['DRAFT', 'SENT']).optional(),
  issueDate: z.string().datetime().optional(),
  overdueAfterDays: z.number().int().min(1).max(365).optional(),
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

    const project = await prisma.project.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true, clientId: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: 'PROJECT_NOT_FOUND', message: 'Project does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
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
    const isPro = isProActive(subscription);

    if (parsed.data.currency !== 'XOF' && !isPro) {
      return NextResponse.json(
        {
          error: 'PLAN_LIMIT_CURRENCY',
          message: 'Le plan Gratuit ne permet que la devise XOF. Passe en Pro pour EUR/USD.',
        },
        { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Same 1-facture cap as POST /api/invoices — this route is a second
    // entry point that creates docType=INVOICE rows and must not bypass it.
    if (!isPro) {
      const freeConfig = await getPlanConfig(prisma, 'FREE');
      const maxInvoices = freeConfig.maxInvoices ?? Infinity;
      const invoiceCount = await prisma.invoice.count({
        where: { userId: auth.user.sub, docType: 'INVOICE' },
      });
      if (invoiceCount >= maxInvoices) {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_INVOICES',
            message: `Le plan Gratuit est limité à ${maxInvoices} facture. Passe en Pro pour en créer davantage.`,
          },
          { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const computedAmount = computeItemsTotal(parsed.data.lineItems);
    if (parsed.data.depositAmount != null && parsed.data.depositAmount > computedAmount) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: "L'acompte ne peut pas dépasser le sous-total de la facture.",
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const year = new Date().getFullYear();

    const resolvedIssueDate = parsed.data.issueDate ? new Date(parsed.data.issueDate) : new Date();
    const resolvedOverdueAfterDays = parsed.data.overdueAfterDays ?? 5;
    const computedDueDate = new Date(
      resolvedIssueDate.getTime() + resolvedOverdueAfterDays * 24 * 60 * 60 * 1000,
    );

    let invoice = null;
    for (let attempt = 0; attempt < MAX_NUMBER_RETRIES && !invoice; attempt++) {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const count = await prisma.invoice.count({
        where: { userId: auth.user.sub, docType: 'INVOICE', createdAt: { gte: yearStart } },
      });
      const number = formatInvoiceNumber('INVOICE', year, count + 1 + attempt);

      try {
        invoice = await prisma.invoice.create({
          data: {
            userId: auth.user.sub,
            clientId: project.clientId,
            projectId: project.id,
            docType: 'INVOICE',
            number,
            ...(parsed.data.description ? { description: parsed.data.description } : {}),
            amount: computedAmount,
            currency: parsed.data.currency,
            exchangeRateToDefault: parsed.data.exchangeRateToDefault ?? null,
            dueDate: computedDueDate,
            issueDate: resolvedIssueDate,
            overdueAfterDays: resolvedOverdueAfterDays,
            ...(parsed.data.status ? { status: parsed.data.status } : {}),
            ...(parsed.data.depositAmount !== undefined
              ? { depositAmount: parsed.data.depositAmount }
              : {}),
            ...(parsed.data.deliveryDate
              ? { deliveryDate: new Date(parsed.data.deliveryDate) }
              : {}),
            ...(parsed.data.paymentMethodNote
              ? { paymentMethodNote: parsed.data.paymentMethodNote }
              : {}),
            ...(parsed.data.footerNote ? { footerNote: parsed.data.footerNote } : {}),
            lineItems: {
              create: parsed.data.lineItems.map((item, i) => ({
                order: i + 1,
                designation: item.designation,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              })),
            },
          },
        });
      } catch (err) {
        const isUniqueConflict =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: unknown }).code === 'P2002';
        if (!isUniqueConflict) throw err;
        // retry with a higher sequence number on the next loop iteration
      }
    }
    if (!invoice) {
      return NextResponse.json(
        {
          error: 'NUMBER_GENERATION_FAILED',
          message: 'Could not generate a unique invoice number',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(invoice, {
      status: 201,
      headers: { 'x-request-id': reqCtx.requestId },
    });
  });
}
