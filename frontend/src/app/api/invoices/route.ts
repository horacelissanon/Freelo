// Freelance CRM (Banani "Espace Freelance Merrudit" import, Phase A —
// see .planning/banani/IMPLEMENTATION-PLAN.md). GET list (cursor
// pagination, filterable by docType) + POST create.
//
// Invoice numbering (per .planning/banani/STATUS.md decision): sequential
// per user+docType+year, computed as `count() + 1` at creation time.
// INVOICE -> "{year}-{seq}" (e.g. "2025-001"), QUOTE -> "QT-{year}-{seq}"
// (e.g. "QT-2025-008") — matches the Banani mock data format. The
// `@@unique([userId, docType, number])` constraint is the real safety net;
// on a rare double-submit race we retry the count once before giving up.
//
// Line items (added alongside the pack/content-block data model): an
// INVOICE is created from a flat `lineItems` array — `amount` is computed
// server-side via `computeItemsTotal`, never accepted from the client.
// A QUOTE is transitional here — it still takes a flat `amount` until the
// multi-pack builder ships (`packs` on this same Body will replace it) —
// this keeps the existing "Nouveau devis" flow working unmodified while
// the INVOICE side moves first.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, decodeCursor, cursorWhere, buildPage } from '@/lib/server/pagination/paginate';
import { getOrCreateSubscription, isProActive } from '@/lib/server/billing/subscription';
import { formatInvoiceNumber } from '@/lib/server/invoices/number';
import { computeItemsTotal } from '@/lib/invoiceTotals';
import { zPositiveInt } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const LineItemInput = z.object({
  designation: z.string().min(1).max(200),
  quantity: zPositiveInt,
  unitPrice: zPositiveInt,
});

const Body = z
  .object({
    clientId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    docType: z.enum(['INVOICE', 'QUOTE']),
    description: z.string().max(500).optional(),
    // QUOTE only, transitional (see file-header comment).
    amount: z.number().int().positive().optional(),
    // INVOICE only.
    lineItems: z.array(LineItemInput).min(1).max(100).optional(),
    currency: z.string().length(3).default('XOF'),
    dueDate: z.string().datetime().optional(),
    // INVOICE only — Acompte/Livraison/Règlement/Note de bas de page.
    depositAmount: z.number().int().min(0).optional(),
    deliveryDate: z.string().datetime().optional(),
    paymentMethodNote: z.string().max(300).optional(),
    footerNote: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.docType === 'INVOICE') {
      if (!data.lineItems || data.lineItems.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lineItems'],
          message: 'lineItems is required to create an invoice',
        });
      }
    } else {
      if (data.lineItems !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lineItems'],
          message: 'lineItems is not supported for a QUOTE yet',
        });
      }
      if (data.amount === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amount'],
          message: 'amount is required to create a quote',
        });
      }
      if (
        data.depositAmount !== undefined ||
        data.deliveryDate !== undefined ||
        data.paymentMethodNote !== undefined ||
        data.footerNote !== undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['docType'],
          message:
            'depositAmount/deliveryDate/paymentMethodNote/footerNote are invoice-only fields',
        });
      }
    }
  });

const MAX_NUMBER_RETRIES = 3;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const docType = url.searchParams.get('docType');
    const status = url.searchParams.get('status');

    const where: Prisma.InvoiceWhereInput = {
      userId: auth.user.sub,
      ...(docType ? { docType } : {}),
      ...(status ? { status } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.invoice.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(buildPage(rows, limit), {
      headers: { 'x-request-id': ctx.requestId },
    });
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
    const {
      clientId,
      projectId,
      docType,
      description,
      amount,
      lineItems,
      currency,
      dueDate,
      depositAmount,
      deliveryDate,
      paymentMethodNote,
      footerNote,
    } = parsed.data;

    const client = await prisma.client.findFirst({
      where: { id: clientId, userId: auth.user.sub },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND', message: 'Client does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: auth.user.sub },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json(
          {
            error: 'PROJECT_NOT_FOUND',
            message: 'Project does not exist or does not belong to you',
          },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    if (currency !== 'XOF') {
      const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
      if (!isProActive(subscription)) {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_CURRENCY',
            message: 'Le plan Gratuit ne permet que la devise XOF. Passe en Pro pour EUR/USD.',
          },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // computedAmount: server-truth total for an INVOICE (from lineItems);
    // amount is still taken as-is for a QUOTE until PR3's pack builder ships.
    const computedAmount = docType === 'INVOICE' ? computeItemsTotal(lineItems!) : amount!;

    if (depositAmount !== undefined && depositAmount > computedAmount) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: "L'acompte ne peut pas dépasser le sous-total de la facture.",
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const year = new Date().getFullYear();

    let invoice = null;
    for (let attempt = 0; attempt < MAX_NUMBER_RETRIES && !invoice; attempt++) {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const count = await prisma.invoice.count({
        where: { userId: auth.user.sub, docType, createdAt: { gte: yearStart } },
      });
      const number = formatInvoiceNumber(docType, year, count + 1 + attempt);

      try {
        invoice = await prisma.invoice.create({
          data: {
            userId: auth.user.sub,
            clientId,
            ...(projectId ? { projectId } : {}),
            docType,
            number,
            ...(description ? { description } : {}),
            amount: computedAmount,
            currency,
            ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
            ...(docType === 'INVOICE'
              ? {
                  ...(depositAmount !== undefined ? { depositAmount } : {}),
                  ...(deliveryDate ? { deliveryDate: new Date(deliveryDate) } : {}),
                  ...(paymentMethodNote ? { paymentMethodNote } : {}),
                  ...(footerNote ? { footerNote } : {}),
                  lineItems: {
                    create: lineItems!.map((item, i) => ({
                      order: i + 1,
                      designation: item.designation,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                    })),
                  },
                }
              : {}),
          },
        });
      } catch (err) {
        const isUniqueConflict =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: unknown }).code === 'P2002';
        if (!isUniqueConflict) throw err;
        // retry with a higher sequence number on the next loop iteration;
        // if this was the last attempt, the loop ends and the `!invoice`
        // check below returns a clean 409 instead of an unhandled throw.
      }
    }
    if (!invoice) {
      return NextResponse.json(
        {
          error: 'NUMBER_GENERATION_FAILED',
          message: 'Could not generate a unique invoice number',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(invoice, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
