// GET /api/track/[token]/pdf — public PDF download for a devis/facture
// shared via its Invoice.trackingToken, mirroring the read-only branch of
// GET /api/track/[token] (kind: 'quote' | 'invoice'). Same anti-leak shape:
// a DRAFT, a disabled public portal, or an unknown token all resolve as a
// plain 404. The token IS the authorization — no login/CSRF involved, same
// as every other /api/track/[token]/* route. Rate-limited per token since
// PDF rendering is the most CPU-costly read this route family exposes.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { resolveDocumentIdentity } from '@/lib/documentIdentity';
import { renderInvoicePdf, type InvoicePdfData } from '@/lib/server/pdf/invoicePdf';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { enforceTokenRateLimit } from '@/lib/server/middleware/rate-limit-by-token';

const RATE_LIMIT_PREFIX = 'rl:track:pdf:';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_HITS = 20;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { token } = await ctx.params;

    const limited = await enforceTokenRateLimit(RATE_LIMIT_PREFIX, token, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxHits: RATE_LIMIT_MAX_HITS,
    });
    if (limited) return limited;

    function notFound(): NextResponse {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Lien de suivi invalide ou expiré.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { trackingToken: token },
      include: {
        client: { select: { name: true, email: true, phone: true, company: true } },
        user: {
          select: {
            publicPortalEnabled: true,
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
          },
        },
        lineItems: { where: { packId: null }, orderBy: { order: 'asc' } },
        packs: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } },
        contentBlocks: { orderBy: [{ kind: 'asc' }, { order: 'asc' }] },
        project: { select: { name: true } },
      },
    });

    if (!invoice || !invoice.user.publicPortalEnabled || invoice.status === 'DRAFT') {
      return notFound();
    }

    const { user: invoiceUser, ...invoiceFields } = invoice;
    const provider = {
      ...resolveDocumentIdentity({
        ...invoiceUser,
        documentIdentity: invoiceUser.documentIdentity as 'PERSONAL' | 'COMPANY',
      }),
      email: invoiceUser.email,
      brandColor: invoiceUser.brandColor,
    };

    // Reached this point only for a non-DRAFT invoice (guard above), so the
    // tracking page always resolves.
    const trackingUrl = `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/suivi/${token}`;

    const pdf = await renderInvoicePdf({
      ...invoiceFields,
      docType: invoiceFields.docType as InvoicePdfData['docType'],
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
