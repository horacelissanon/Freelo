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
import { PROJECT_TYPE_VALUES } from '@/lib/constants';

const LineItemInput = z.object({
  designation: z.string().min(1).max(200),
  quantity: zPositiveInt,
  unitPrice: zPositiveInt,
});

const PackInput = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    items: z.array(LineItemInput).min(1).max(50),
    // Per-offer acompte — a devis with several packs can ask a different
    // deposit per offer. FIXED: depositValue is an amount in the smallest
    // currency unit. PERCENT: depositValue is a 0-100 rate applied to this
    // pack's own total (never a grand total across offers).
    depositType: z.enum(['FIXED', 'PERCENT']).nullable().optional(),
    depositValue: z.number().int().min(0).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.depositType && data.depositValue == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositValue'],
        message: 'depositValue is required when depositType is set',
      });
    }
    if (data.depositType === 'PERCENT' && data.depositValue != null && data.depositValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositValue'],
        message: "Le taux d'acompte ne peut pas dépasser 100%.",
      });
    }
  });

const ContentBlockInput = z.object({
  kind: z.enum(['PROCESS', 'CONDITIONS', 'PAYMENT_METHOD', 'FAQ']),
  primaryText: z.string().min(1).max(500),
  secondaryText: z.string().max(2000).optional(),
});

const Body = z
  .object({
    clientId: z.string().min(1),
    // Nullable, not just optional: the create forms reuse the same
    // shared-payload shape as their PATCH counterpart, which sends explicit
    // `null` for "left blank" rather than omitting the key — .optional()
    // alone rejects `null` (invalid_type), which silently 400'd every
    // creation with an empty project/description/due-date/etc field.
    projectId: z.string().min(1).nullable().optional(),
    docType: z.enum(['INVOICE', 'QUOTE']),
    description: z.string().max(500).nullable().optional(),
    // INVOICE only.
    lineItems: z.array(LineItemInput).min(1).max(100).optional(),
    // QUOTE only.
    packs: z.array(PackInput).min(1).max(20).optional(),
    // QUOTE only — mirrors Project.sector/Project.type so an accepted devis
    // can pre-fill a new project with the same vocabulary.
    sector: z.string().min(1).max(100).nullable().optional(),
    type: z.enum(PROJECT_TYPE_VALUES).nullable().optional(),
    // Lets "Prêt à envoyer"/"Enregistrer brouillon" skip the extra PATCH
    // round-trip by setting the target status directly at creation instead
    // of the DB default (DRAFT). Deliberately not the full PATCHABLE_STATUSES
    // set — nothing can be created already PAID/OVERDUE/ACCEPTED/EXPIRED.
    status: z.enum(['DRAFT', 'SENT']).optional(),
    // QUOTE only, optional — additional devis sections (Processus/Conditions/
    // Modalités de paiement/FAQ), pre-filled client-side from the user's
    // last quote ("last quote as template" — see QuoteBuilderForm.tsx).
    contentBlocks: z.array(ContentBlockInput).max(80).optional(),
    paymentTermsNote: z.string().max(2000).nullable().optional(),
    currency: z.string().length(3).default('XOF'),
    // QUOTE only — the freely-picked "Échéance" feeding the EXPIRED sweep.
    // INVOICE no longer accepts an absolute due date directly (see
    // issueDate/overdueAfterDays below) — dueDate is server-computed.
    dueDate: z.string().datetime().nullable().optional(),
    // INVOICE only — Acompte/Livraison/Règlement/Note de bas de page.
    depositAmount: z.number().int().min(0).nullable().optional(),
    deliveryDate: z.string().datetime().nullable().optional(),
    paymentMethodNote: z.string().max(300).nullable().optional(),
    footerNote: z.string().max(1000).nullable().optional(),
    // INVOICE only — "Date facture" (issueDate, defaults to now) + "Jours
    // avant retard" (overdueAfterDays, defaults to 5). dueDate is computed
    // server-side from these two whenever provided, replacing the old
    // freely-picked Échéance field.
    issueDate: z.string().datetime().optional(),
    overdueAfterDays: z.number().int().min(1).max(365).optional(),
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
      if (data.dueDate !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dueDate'],
          message: 'dueDate is quote-only for an invoice — use issueDate/overdueAfterDays',
        });
      }
      if (
        data.contentBlocks !== undefined ||
        data.paymentTermsNote !== undefined ||
        data.sector !== undefined ||
        data.type !== undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['docType'],
          message: 'contentBlocks/paymentTermsNote/sector/type are quote-only fields',
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
        data.footerNote !== undefined ||
        data.issueDate !== undefined ||
        data.overdueAfterDays !== undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['docType'],
          message:
            'depositAmount/deliveryDate/paymentMethodNote/footerNote/issueDate/overdueAfterDays are invoice-only fields',
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
    const clientId = url.searchParams.get('clientId');

    const where: Prisma.InvoiceWhereInput = {
      userId: auth.user.sub,
      ...(docType ? { docType } : {}),
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.invoice.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        client: { select: { id: true, name: true } },
        // Light select (no titles/descriptions) — just enough for the list
        // row to compute a devis's "Acompte prévu" via computePackDeposit,
        // without pulling full pack detail for every row on the page.
        packs: {
          select: {
            id: true,
            depositType: true,
            depositValue: true,
            items: { select: { quantity: true, unitPrice: true } },
          },
        },
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
      contentBlocks,
      paymentTermsNote,
      sector,
      type,
      status,
      currency,
      dueDate,
      depositAmount,
      deliveryDate,
      paymentMethodNote,
      footerNote,
      issueDate,
      overdueAfterDays,
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

    if (depositAmount != null && depositAmount > computedAmount) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: "L'acompte ne peut pas dépasser le sous-total de la facture.",
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (packs) {
      const overDeposit = packs.some(
        (pack) =>
          pack.depositType === 'FIXED' &&
          pack.depositValue != null &&
          pack.depositValue > computeItemsTotal(pack.items),
      );
      if (overDeposit) {
        return NextResponse.json(
          {
            error: 'VALIDATION_FAILED',
            message: "L'acompte d'une offre ne peut pas dépasser son propre sous-total.",
          },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const year = new Date().getFullYear();

    // INVOICE: dueDate is never accepted directly — computed from
    // issueDate ("Date facture", defaults to now) + overdueAfterDays
    // ("Jours avant retard", defaults to 5). QUOTE keeps its freely-picked
    // absolute Échéance.
    const resolvedIssueDate = issueDate ? new Date(issueDate) : new Date();
    const resolvedOverdueAfterDays = overdueAfterDays ?? 5;
    const computedDueDate =
      docType === 'INVOICE'
        ? new Date(resolvedIssueDate.getTime() + resolvedOverdueAfterDays * 24 * 60 * 60 * 1000)
        : dueDate
          ? new Date(dueDate)
          : null;

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
        ...(computedDueDate ? { dueDate: computedDueDate } : {}),
        ...(docType === 'INVOICE'
          ? { issueDate: resolvedIssueDate, overdueAfterDays: resolvedOverdueAfterDays }
          : {}),
        ...(docType === 'QUOTE' && paymentTermsNote ? { paymentTermsNote } : {}),
        ...(docType === 'QUOTE' && sector ? { sector } : {}),
        ...(docType === 'QUOTE' && type ? { type } : {}),
        ...(status ? { status } : {}),
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
                  ...(pack.depositType && pack.depositValue != null
                    ? { depositType: pack.depositType, depositValue: pack.depositValue }
                    : {}),
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
            if (contentBlocks && contentBlocks.length > 0) {
              const kindCounters: Record<string, number> = {};
              await tx.quoteContentBlock.createMany({
                data: contentBlocks.map((block) => {
                  const order = (kindCounters[block.kind] = (kindCounters[block.kind] ?? 0) + 1);
                  return {
                    invoiceId: created.id,
                    kind: block.kind,
                    order,
                    primaryText: block.primaryText,
                    ...(block.secondaryText ? { secondaryText: block.secondaryText } : {}),
                  };
                }),
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
