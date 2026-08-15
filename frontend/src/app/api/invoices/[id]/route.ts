// Freelance CRM — single-invoice detail + manual status reconciliation
// (e.g. "mark as paid" for an offline/cash payment). Scoped to
// `auth.user.sub` like the list route — an invoice belonging to another
// user resolves as 404, not 403, to avoid leaking existence.
//
// Once an invoice leaves DRAFT (i.e. it may already have been shared with
// the client), its content is frozen — PATCH can still change `status`,
// but clientId/projectId/description/amount/currency/dueDate are rejected.
// This mirrors the DELETE rule below and protects the same audit trail:
// silently rewriting a sent invoice's amount would be exactly as
// destructive as deleting it. PATCH can NOT set CANCELED and can NOT touch
// a CREDIT_NOTE row or an already-CANCELED invoice either way — per the
// no-hard-delete business rule, the only way to void a non-draft invoice
// is POST /api/invoices/[id]/credit-note, which flips the original to
// CANCELED atomically alongside creating the credit note.
//
// DELETE is real (hard) deletion, but DRAFT-only by explicit product
// decision: a draft was never sent to the client, so removing it doesn't
// break any accounting trail. Anything past DRAFT can only be canceled via
// a credit note, never deleted.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getOrCreateSubscription, isProActive } from '@/lib/server/billing/subscription';
import { computeItemsTotal, computeQuoteTotal } from '@/lib/invoiceTotals';
import { zPositiveInt } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PATCHABLE_STATUSES = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'ACCEPTED'] as const;

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

const PatchBody = z.object({
  status: z.enum(PATCHABLE_STATUSES).optional(),
  clientId: z.string().min(1).optional(),
  projectId: z.string().min(1).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  currency: z.string().length(3).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  // INVOICE-only bulk replace — the whole array is sent every time and the
  // handler deletes+recreates the flat (packId: null) lines to match, same
  // shape as ProjectForm's steps but as a single edit-time PATCH instead of
  // per-row endpoints (no concurrent-editor race to guard against on a
  // DRAFT owned by a single user).
  lineItems: z.array(LineItemInput).min(1).max(100).optional(),
  // QUOTE-only bulk replace, same reasoning as lineItems above.
  packs: z.array(PackInput).min(1).max(20).optional(),
  depositAmount: z.number().int().min(0).nullable().optional(),
  deliveryDate: z.string().datetime().nullable().optional(),
  paymentMethodNote: z.string().max(300).nullable().optional(),
  footerNote: z.string().max(1000).nullable().optional(),
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

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: auth.user.sub },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, company: true, city: true },
        },
        project: { select: { id: true, name: true } },
        relatedInvoice: { select: { id: true, number: true, docType: true, status: true } },
        creditNote: { select: { id: true, number: true, docType: true, status: true } },
        // lineItems always carries invoiceId, even for a QUOTE's pack items —
        // filter to packId:null for the flat (INVOICE) subset; packs.items
        // is the real per-pack list for a QUOTE.
        lineItems: { where: { packId: null }, orderBy: { order: 'asc' } },
        packs: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND', message: 'Invoice does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(invoice, { headers: { 'x-request-id': reqCtx.requestId } });
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

    const existing = await prisma.invoice.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true, docType: true, status: true, amount: true, depositAmount: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND', message: 'Invoice does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (existing.docType === 'CREDIT_NOTE') {
      return NextResponse.json(
        {
          error: 'CREDIT_NOTE_IMMUTABLE',
          message: 'Une facture d’avoir ne peut pas être modifiée.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (existing.status === 'CANCELED') {
      return NextResponse.json(
        {
          error: 'INVOICE_CANCELED',
          message:
            'Cette facture est annulée et ne peut plus être modifiée. Émets une nouvelle facture si besoin.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
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
      status,
      clientId,
      projectId,
      description,
      currency,
      dueDate,
      lineItems,
      packs,
      depositAmount,
      deliveryDate,
      paymentMethodNote,
      footerNote,
    } = parsed.data;

    const editingContent =
      clientId !== undefined ||
      projectId !== undefined ||
      description !== undefined ||
      currency !== undefined ||
      dueDate !== undefined ||
      lineItems !== undefined ||
      packs !== undefined ||
      depositAmount !== undefined ||
      deliveryDate !== undefined ||
      paymentMethodNote !== undefined ||
      footerNote !== undefined;

    if (editingContent && existing.status !== 'DRAFT') {
      return NextResponse.json(
        {
          error: 'INVOICE_NOT_EDITABLE',
          message:
            'Seul un brouillon peut être modifié. Une facture déjà envoyée ne peut plus changer de contenu — émets un avoir pour la corriger.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (
      existing.docType === 'QUOTE' &&
      (lineItems !== undefined ||
        depositAmount !== undefined ||
        deliveryDate !== undefined ||
        paymentMethodNote !== undefined ||
        footerNote !== undefined)
    ) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message:
            'lineItems/depositAmount/deliveryDate/paymentMethodNote/footerNote are invoice-only fields',
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (existing.docType === 'INVOICE' && packs !== undefined) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'packs is not supported for an invoice — use lineItems',
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
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
          { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }
    if (currency !== undefined && currency !== 'XOF') {
      const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
      if (!isProActive(subscription)) {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_CURRENCY',
            message: 'Le plan Gratuit ne permet que la devise XOF. Passe en Pro pour EUR/USD.',
          },
          { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    // newAmount: computed from lineItems (INVOICE) or packs (QUOTE) — the
    // docType gate above guarantees these two are mutually exclusive, never
    // both set on the same request.
    const newAmount =
      lineItems !== undefined
        ? computeItemsTotal(lineItems)
        : packs !== undefined
          ? computeQuoteTotal(packs)
          : undefined;
    const finalAmount = newAmount !== undefined ? newAmount : existing.amount;
    const finalDeposit = depositAmount !== undefined ? depositAmount : existing.depositAmount;
    if (finalDeposit !== null && finalDeposit !== undefined && finalDeposit > finalAmount) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: "L'acompte ne peut pas dépasser le sous-total de la facture.",
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const updateData = {
      ...(status !== undefined ? { status } : {}),
      ...(clientId !== undefined ? { clientId } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(newAmount !== undefined ? { amount: newAmount } : {}),
      ...(currency !== undefined ? { currency } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(depositAmount !== undefined ? { depositAmount } : {}),
      ...(deliveryDate !== undefined
        ? { deliveryDate: deliveryDate ? new Date(deliveryDate) : null }
        : {}),
      ...(paymentMethodNote !== undefined ? { paymentMethodNote } : {}),
      ...(footerNote !== undefined ? { footerNote } : {}),
    };

    let invoice;
    if (lineItems !== undefined) {
      invoice = await prisma.$transaction(async (tx) => {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id, packId: null } });
        await tx.invoiceLineItem.createMany({
          data: lineItems.map((item, i) => ({
            invoiceId: id,
            order: i + 1,
            designation: item.designation,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        });
        return tx.invoice.update({ where: { id }, data: updateData });
      });
    } else if (packs !== undefined) {
      invoice = await prisma.$transaction(async (tx) => {
        // Deleting the packs cascades their items (InvoiceLineItem.packId
        // has onDelete: Cascade) — no separate item cleanup needed.
        await tx.invoicePack.deleteMany({ where: { invoiceId: id } });
        for (const [pi, pack] of packs.entries()) {
          await tx.invoicePack.create({
            data: {
              invoiceId: id,
              order: pi + 1,
              title: pack.title,
              ...(pack.description ? { description: pack.description } : {}),
              items: {
                create: pack.items.map((item, ii) => ({
                  invoiceId: id,
                  order: ii + 1,
                  designation: item.designation,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                })),
              },
            },
          });
        }
        return tx.invoice.update({ where: { id }, data: updateData });
      });
    } else {
      invoice = await prisma.invoice.update({ where: { id }, data: updateData });
    }

    return NextResponse.json(invoice, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

export async function DELETE(
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

    const existing = await prisma.invoice.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND', message: 'Invoice does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        {
          error: 'INVOICE_NOT_DRAFT',
          message:
            'Seul un brouillon peut être supprimé. Émets un avoir pour annuler une facture déjà envoyée.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.invoice.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
