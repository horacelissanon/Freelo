// GET /api/invoices/[id]/pdf — freelance-side PDF download for a devis or
// facture. Same ownership scoping as GET /api/invoices/[id] (a document
// belonging to another user resolves as 404, not 403). Streams back a real
// application/pdf with Content-Disposition: attachment — the "Télécharger"
// button links here directly instead of calling window.print(), so the
// user gets an actual file instead of the browser's print dialog.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getOrCreateSubscription, isProActive } from '@/lib/server/billing/subscription';
import { resolveDocumentIdentity } from '@/lib/documentIdentity';
import { renderInvoicePdf, type InvoicePdfData } from '@/lib/server/pdf/invoicePdf';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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
        client: { select: { name: true, email: true, phone: true, company: true } },
        lineItems: { where: { packId: null }, orderBy: { order: 'asc' } },
        packs: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } },
        contentBlocks: { orderBy: [{ kind: 'asc' }, { order: 'asc' }] },
        project: { select: { name: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND', message: 'Invoice does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const owner = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: {
        documentIdentity: true,
        studioName: true,
        name: true,
        email: true,
        phone: true,
        companyPhone: true,
        slogan: true,
        bio: true,
        address: true,
        taxId: true,
        commerceRegistry: true,
        brandColor: true,
        logoUrl: true,
      },
    });
    if (!owner) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND', message: 'Invoice does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
    const isPro = isProActive(subscription);
    const identity = resolveDocumentIdentity(
      {
        ...owner,
        documentIdentity: owner.documentIdentity as 'PERSONAL' | 'COMPANY',
      },
      isPro,
    );

    const provider = {
      ...identity,
      email: owner.email,
      brandColor: owner.brandColor,
    };

    // No tracking page exists for a DRAFT yet (GET /api/track/[token] 404s
    // it) — skip the QR code rather than point to a dead link.
    const trackingUrl =
      invoice.status === 'DRAFT'
        ? null
        : `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/suivi/${invoice.trackingToken}`;

    const pdf = await renderInvoicePdf({
      ...invoice,
      docType: invoice.docType as InvoicePdfData['docType'],
      client: invoice.client,
      provider,
      trackingUrl,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.number}.pdf"`,
        'x-request-id': reqCtx.requestId,
      },
    });
  });
}
