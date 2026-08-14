// Freelance CRM — single-invoice detail + manual status reconciliation
// (e.g. "mark as paid" for an offline/cash payment). Scoped to
// `auth.user.sub` like the list route — an invoice belonging to another
// user resolves as 404, not 403, to avoid leaking existence.
//
// PATCH only ever touches `status`, and only to one of the "normal
// lifecycle" values below. It deliberately can NOT set CANCELED and can
// NOT touch a CREDIT_NOTE row or an already-CANCELED invoice — per the
// no-hard-delete business rule, the only way to void an invoice is
// POST /api/invoices/[id]/credit-note, which flips the original to
// CANCELED atomically alongside creating the credit note.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PATCHABLE_STATUSES = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'ACCEPTED'] as const;

const PatchBody = z.object({
  status: z.enum(PATCHABLE_STATUSES),
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
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        relatedInvoice: { select: { id: true, number: true, docType: true, status: true } },
        creditNote: { select: { id: true, number: true, docType: true, status: true } },
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
      select: { id: true, docType: true, status: true },
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

    const invoice = await prisma.invoice.update({
      where: { id },
      data: { status: parsed.data.status },
    });

    return NextResponse.json(invoice, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
