// Public, unauthenticated project-tracking endpoint (Client Link Portal,
// Phase C). One `token` param resolves against a Client.trackingToken
// (client shares one link, sees all their projects + devis/factures), a
// Project.publicToken (a single project's rich detail: steps, comments,
// deposit/balance status), or an Invoice.trackingToken (a single devis/
// facture, read-only — a QUOTE additionally exposes POST .../validate).
// The token IS the authorization — no login/CSRF involved.
//
// An invoice/quote is only served once it has left DRAFT (never share a
// link to something that hasn't been sent yet) — same anti-leak shape as
// everywhere else here: 404, not a distinct "not ready" error.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { resolveDocumentIdentity } from '@/lib/documentIdentity';

interface PaidOrderMeta {
  projectId?: string;
  docType?: 'DEPOSIT' | 'BALANCE';
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { token } = await ctx.params;

    function notFound(): NextResponse {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Lien de suivi invalide ou expiré.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const client = await prisma.client.findUnique({
      where: { trackingToken: token },
      select: {
        name: true,
        user: { select: { publicPortalEnabled: true } },
        projects: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            status: true,
            progress: true,
            amount: true,
            currency: true,
            dueDate: true,
            step: true,
            publicToken: true,
          },
        },
        invoices: {
          where: { status: { not: 'DRAFT' } },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            number: true,
            docType: true,
            status: true,
            amount: true,
            currency: true,
            trackingToken: true,
          },
        },
      },
    });

    if (client) {
      if (!client.user.publicPortalEnabled) return notFound();
      return NextResponse.json(
        {
          kind: 'client',
          client: { name: client.name },
          projects: client.projects,
          invoices: client.invoices,
        },
        { headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const project = await prisma.project.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        name: true,
        status: true,
        progress: true,
        amount: true,
        currency: true,
        dueDate: true,
        step: true,
        depositPercent: true,
        createdAt: true,
        client: { select: { name: true } },
        user: { select: { publicPortalEnabled: true } },
        steps: { orderBy: { order: 'asc' } },
        comments: { orderBy: { createdAt: 'asc' } },
        review: { select: { rating: true, comment: true } },
      },
    });

    if (project) {
      if (!project.user.publicPortalEnabled) return notFound();

      // Deposit/balance status is derived from PAID Orders tagged with this
      // project in `metadata` — no dedicated payment table (reuses the
      // existing Order model rather than inventing a parallel one). Filtered
      // at the DB level via a JSON path match, not loaded-then-filtered.
      const paidOrders = await prisma.order.findMany({
        where: { status: 'PAID', metadata: { path: ['projectId'], equals: project.id } },
        select: { metadata: true },
      });
      const paidKinds = new Set(
        paidOrders.map((o) => (o.metadata as PaidOrderMeta | null)?.docType).filter(Boolean),
      );

      const depositAmount = Math.round((project.amount * project.depositPercent) / 100);
      const balanceAmount = project.amount - depositAmount;

      const { steps, comments, review, client: projectClient, user, ...projectFields } = project;
      void user; // consumed above for the publicPortalEnabled gate; excluded from the response
      return NextResponse.json(
        {
          kind: 'project',
          project: { ...projectFields, client: { name: projectClient.name } },
          steps,
          comments,
          review: review ?? null,
          deposit: { amount: depositAmount, paid: paidKinds.has('DEPOSIT') },
          balance: { amount: balanceAmount, paid: paidKinds.has('BALANCE') },
        },
        { headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { trackingToken: token },
      select: {
        id: true,
        number: true,
        docType: true,
        status: true,
        description: true,
        amount: true,
        currency: true,
        issueDate: true,
        dueDate: true,
        selectedPackId: true,
        client: { select: { name: true } },
        user: {
          select: {
            publicPortalEnabled: true,
            documentIdentity: true,
            studioName: true,
            name: true,
            email: true,
            phone: true,
            bio: true,
            address: true,
            taxId: true,
            commerceRegistry: true,
          },
        },
        // lineItems always carries invoiceId, even for a QUOTE's pack items —
        // filter to packId:null for the flat (INVOICE) subset.
        lineItems: { where: { packId: null }, orderBy: { order: 'asc' } },
        packs: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } },
        contentBlocks: { orderBy: [{ kind: 'asc' }, { order: 'asc' }] },
        paymentTermsNote: true,
        depositAmount: true,
        deliveryDate: true,
        paymentMethodNote: true,
        footerNote: true,
      },
    });

    if (!invoice || !invoice.user.publicPortalEnabled || invoice.status === 'DRAFT') {
      return notFound();
    }

    const { user: invoiceUser, ...invoiceFields } = invoice;
    return NextResponse.json(
      {
        kind: invoice.docType === 'QUOTE' ? 'quote' : 'invoice',
        invoice: invoiceFields,
        provider: resolveDocumentIdentity({
          ...invoiceUser,
          documentIdentity: invoiceUser.documentIdentity as 'PERSONAL' | 'COMPANY',
        }),
        // Raw phone, independent of the documentIdentity header choice —
        // COMPANY identity hides the phone from the document itself, but the
        // freelancer still has a real WhatsApp number to notify once the
        // client sends the acompte (see the post-validation modal).
        providerPhone: invoiceUser.phone,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
