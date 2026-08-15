// Freelance CRM — "no hard delete of invoices" business rule. The only way
// to void an INVOICE is to issue a CREDIT_NOTE that fully mirrors its
// amount/currency/client/project; the original flips to CANCELED in the
// same transaction so the two rows never disagree. One credit note per
// invoice (enforced by `Invoice.relatedInvoiceId @unique`) — re-issue a
// fresh INVOICE for a corrected amount rather than stacking credit notes.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { formatInvoiceNumber } from '@/lib/server/invoices/number';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MAX_NUMBER_RETRIES = 3;

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

    const original = await prisma.invoice.findFirst({
      where: { id, userId: auth.user.sub },
      include: {
        creditNote: { select: { id: true } },
        lineItems: { where: { packId: null }, orderBy: { order: 'asc' } },
      },
    });
    if (!original) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND', message: 'Invoice does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (original.docType !== 'INVOICE') {
      return NextResponse.json(
        {
          error: 'NOT_AN_INVOICE',
          message: 'Seule une facture peut être annulée par un avoir.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (original.status === 'CANCELED') {
      return NextResponse.json(
        { error: 'INVOICE_ALREADY_CANCELED', message: 'Cette facture est déjà annulée.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (original.creditNote) {
      return NextResponse.json(
        {
          error: 'CREDIT_NOTE_ALREADY_EXISTS',
          message: 'Un avoir existe déjà pour cette facture.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const year = new Date().getFullYear();

    let creditNote = null;
    for (let attempt = 0; attempt < MAX_NUMBER_RETRIES && !creditNote; attempt++) {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const count = await prisma.invoice.count({
        where: { userId: auth.user.sub, docType: 'CREDIT_NOTE', createdAt: { gte: yearStart } },
      });
      const number = formatInvoiceNumber('CREDIT_NOTE', year, count + 1 + attempt);

      try {
        creditNote = await prisma.$transaction(async (tx) => {
          const note = await tx.invoice.create({
            data: {
              userId: auth.user.sub,
              clientId: original.clientId,
              ...(original.projectId ? { projectId: original.projectId } : {}),
              docType: 'CREDIT_NOTE',
              number,
              description: `Avoir annulant la facture ${original.number}`,
              amount: original.amount,
              currency: original.currency,
              status: 'ACCEPTED',
              relatedInvoiceId: original.id,
            },
          });
          if (original.lineItems.length > 0) {
            await tx.invoiceLineItem.createMany({
              data: original.lineItems.map((item, i) => ({
                invoiceId: note.id,
                order: i + 1,
                designation: item.designation,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              })),
            });
          }
          await tx.invoice.update({
            where: { id: original.id },
            data: { status: 'CANCELED' },
          });
          return note;
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
    if (!creditNote) {
      return NextResponse.json(
        {
          error: 'NUMBER_GENERATION_FAILED',
          message: 'Could not generate a unique credit note number',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(creditNote, {
      status: 201,
      headers: { 'x-request-id': reqCtx.requestId },
    });
  });
}
