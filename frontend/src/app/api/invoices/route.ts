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
// Line items / packs: an INVOICE is created from a flat `lineItems` array;
// a QUOTE is created from `packs` (each with its own repeatable items) —
// one or more selectable offers/tiers, per the "Nouveau devis" builder.
// `amount` is never accepted from the client for either docType — it's
// always computed server-side (computeItemsTotal / computeQuoteTotal).
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
import { computeItemsTotal, computeQuoteTotal } from '@/lib/invoiceTotals';
import { zPositiveInt } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const LineItemInput = z.object({
  designation: z.string().min(1).max(200),
  quantity: zPositiveInt,
  unitPrice: zPositiveInt,
});

const PackInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  items: z.array(LineItemInput).min(1).max(50),
});

const Body = z
  .object({
    clientId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    docType: z.enum(['INVOICE', 'QUOTE']),
    description: z.string().max(500).optional(),
    // INVOICE only.
    lineItems: z.array(LineItemInput).min(1).max(100).optional(),
    // QUOTE only.
    packs: z.array(PackInput).min(1).max(20).optional(),
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
      if (data.packs !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['packs'],
          message: 'packs is not supported for an invoice',
        });
      }
    } else {
      if (!data.packs || data.packs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['packs'],
          message: 'packs is required to create a quote',
        });
      }
      if (data.lineItems !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lineItems'],
          message: 'lineItems is not supported for a quote — use packs',
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
      lineItems,
      packs,
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

    // computedAmount: server-truth total, from lineItems (INVOICE) or packs (QUOTE).
    const computedAmount =
      docType === 'INVOICE' ? computeItemsTotal(lineItems!) : computeQuoteTotal(packs!);

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

      const baseData = {
        userId: auth.user.sub,
        clientId,
        ...(projectId ? { projectId } : {}),
        docType,
        number,
        ...(description ? { description } : {}),
        amount: computedAmount,
        currency,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
      };

      try {
        if (docType === 'INVOICE') {
          invoice = await prisma.invoice.create({
            data: {
              ...baseData,
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
            },
          });
        } else {
          // Packs are created in a follow-up loop rather than a single nested
          // write: InvoiceLineItem.invoiceId is a sibling relation to
          // InvoicePack (not the immediate parent), so Prisma cannot infer it
          // from a `pack.items.create` nesting — it must be passed explicitly,
          // which requires the Invoice's id up front.
          invoice = await prisma.$transaction(async (tx) => {
            const created = await tx.invoice.create({ data: baseData });
            for (const [pi, pack] of packs!.entries()) {
              await tx.invoicePack.create({
                data: {
                  invoiceId: created.id,
                  order: pi + 1,
                  title: pack.title,
                  ...(pack.description ? { description: pack.description } : {}),
                  items: {
                    create: pack.items.map((item, ii) => ({
                      invoiceId: created.id,
                      order: ii + 1,
                      designation: item.designation,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                    })),
                  },
                },
              });
            }
            return created;
          });
        }
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
