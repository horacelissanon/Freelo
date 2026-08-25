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
//
// Rate-limited per token like every sibling track/[token]/* route — this is
// a read (page load + the tracking page's manual "Actualiser" button), so
// the ceiling is deliberately higher than the mutating siblings' 10/10min.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { resolveDocumentIdentity, type DocumentIdentitySource } from '@/lib/documentIdentity';
import { getOrCreateSubscription, isProActive } from '@/lib/server/billing/subscription';
import { computeDepositBalance } from '@/lib/server/projects/depositBalance';
import { enforceTokenRateLimit } from '@/lib/server/middleware/rate-limit-by-token';

const RATE_LIMIT_PREFIX = 'rl:track:get:';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_HITS = 60;

interface TrackedContentBlockShape {
  id: string;
  kind: string;
  primaryText: string;
  secondaryText: string | null;
}

// Live (never frozen) fallback for the freelancer's own default payment
// methods — used wherever a project or devis has no PAYMENT_METHOD content
// of its own. See DefaultPaymentMethod in schema.prisma.
async function resolveDefaultPaymentBlocks(userId: string): Promise<TrackedContentBlockShape[]> {
  const defaults = await prisma.defaultPaymentMethod.findMany({
    where: { userId },
    orderBy: { order: 'asc' },
    select: { id: true, primaryText: true, secondaryText: true },
  });
  return defaults.map((d) => ({
    id: d.id,
    kind: 'PAYMENT_METHOD',
    primaryText: d.primaryText,
    secondaryText: d.secondaryText,
  }));
}

// Minimal name+photo projection for the tracking page's top brand block —
// distinct from the full `provider` object the quote/invoice view also
// returns (bio/address/tax fields only that view needs). Photo choice
// mirrors the freelancer's documentIdentity choice (studio logo for
// COMPANY, personal photo for PERSONAL) but, unlike resolveDocumentIdentity's
// logoUrl (which stays null for PERSONAL — formal documents never show a
// personal photo), a PERSONAL freelancer's avatar IS shown here. Gated by
// isPro like every other ZeFacto-branding-replacement perk.
function resolveProviderBrand(
  user: DocumentIdentitySource & { avatarUrl: string | null },
  isPro: boolean,
): { name: string; photoUrl: string | null } {
  const { name } = resolveDocumentIdentity(user, isPro);
  if (!isPro) return { name, photoUrl: null };
  return { name, photoUrl: user.documentIdentity === 'COMPANY' ? user.logoUrl : user.avatarUrl };
}

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

    const client = await prisma.client.findUnique({
      where: { trackingToken: token },
      select: {
        name: true,
        user: {
          select: {
            id: true,
            publicPortalEnabled: true,
            brandColor: true,
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
            avatarUrl: true,
            logoUrl: true,
          },
        },
        projects: {
          where: { status: { not: 'DRAFT' } },
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
      const clientOwnerSubscription = await getOrCreateSubscription(prisma, client.user.id);
      const clientOwnerIsPro = isProActive(clientOwnerSubscription);
      return NextResponse.json(
        {
          kind: 'client',
          client: { name: client.name },
          projects: client.projects,
          invoices: client.invoices,
          brandColor: client.user.brandColor,
          isPro: clientOwnerIsPro,
          providerBrand: resolveProviderBrand(
            {
              ...client.user,
              documentIdentity: client.user.documentIdentity as 'PERSONAL' | 'COMPANY',
            },
            clientOwnerIsPro,
          ),
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
        depositType: true,
        depositValue: true,
        createdAt: true,
        client: { select: { name: true } },
        user: {
          select: {
            id: true,
            publicPortalEnabled: true,
            phone: true,
            brandColor: true,
            documentIdentity: true,
            studioName: true,
            name: true,
            email: true,
            companyPhone: true,
            slogan: true,
            bio: true,
            address: true,
            taxId: true,
            commerceRegistry: true,
            avatarUrl: true,
            logoUrl: true,
          },
        },
        steps: { orderBy: { order: 'asc' } },
        comments: { orderBy: { createdAt: 'asc' } },
        review: { select: { rating: true, comment: true } },
      },
    });

    if (project) {
      if (!project.user.publicPortalEnabled || project.status === 'DRAFT') return notFound();

      // Deposit/balance status is derived from PAID Orders tagged with this
      // project in `metadata` — no dedicated payment table (reuses the
      // existing Order model rather than inventing a parallel one). Shared
      // with GET /api/projects/[id] via computeDepositBalance so the
      // authenticated dashboard and this public portal never disagree.
      const { deposit, balance } = await computeDepositBalance(prisma, project);

      // The Payments block on the tracking page is informational only (no
      // online charge from here — see /api/track/[token]/pay's comment for
      // why that path stays unlinked from the UI): it reuses whatever
      // payment info the originating devis carried, falling back to the
      // freelancer's own default payment methods (Paramètres → Facturation)
      // when there's no origin devis, or its PAYMENT_METHOD block was left
      // empty — this fallback is resolved live on every read, not frozen.
      const originQuote = await prisma.invoice.findFirst({
        where: { projectId: project.id, docType: 'QUOTE' },
        select: {
          paymentTermsNote: true,
          contentBlocks: { where: { kind: 'PAYMENT_METHOD' }, orderBy: { order: 'asc' } },
        },
      });
      const paymentBlocks =
        originQuote && originQuote.contentBlocks.length > 0
          ? originQuote.contentBlocks
          : await resolveDefaultPaymentBlocks(project.user.id);

      const { steps, comments, review, client: projectClient, user, ...projectFields } = project;
      const projectOwnerSubscription = await getOrCreateSubscription(prisma, user.id);
      const projectOwnerIsPro = isProActive(projectOwnerSubscription);
      return NextResponse.json(
        {
          kind: 'project',
          project: { ...projectFields, client: { name: projectClient.name } },
          steps,
          comments,
          review: review ?? null,
          deposit,
          balance,
          providerPhone: user.phone,
          brandColor: user.brandColor,
          isPro: projectOwnerIsPro,
          providerBrand: resolveProviderBrand(
            { ...user, documentIdentity: user.documentIdentity as 'PERSONAL' | 'COMPANY' },
            projectOwnerIsPro,
          ),
          paymentInfo:
            originQuote?.paymentTermsNote != null || paymentBlocks.length > 0
              ? { note: originQuote?.paymentTermsNote ?? null, blocks: paymentBlocks }
              : null,
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
            id: true,
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
            logoUrl: true,
            avatarUrl: true,
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
    // Same live fallback as the project branch above — a devis created
    // before default payment methods existed (or whose block was left
    // empty) still shows something useful instead of nothing.
    const hasPaymentBlocks = invoice.contentBlocks.some((b) => b.kind === 'PAYMENT_METHOD');
    const contentBlocks: TrackedContentBlockShape[] =
      invoice.docType === 'QUOTE' && !hasPaymentBlocks
        ? [...invoice.contentBlocks, ...(await resolveDefaultPaymentBlocks(invoiceUser.id))]
        : invoice.contentBlocks;
    const subscription = await getOrCreateSubscription(prisma, invoiceUser.id);
    const isPro = isProActive(subscription);
    const identity = resolveDocumentIdentity(
      {
        ...invoiceUser,
        documentIdentity: invoiceUser.documentIdentity as 'PERSONAL' | 'COMPANY',
      },
      isPro,
    );
    return NextResponse.json(
      {
        kind: invoice.docType === 'QUOTE' ? 'quote' : 'invoice',
        invoice: { ...invoiceFields, contentBlocks },
        provider: identity,
        providerBrand: resolveProviderBrand(
          {
            ...invoiceUser,
            documentIdentity: invoiceUser.documentIdentity as 'PERSONAL' | 'COMPANY',
          },
          isPro,
        ),
        isPro,
        // Raw phone, independent of the documentIdentity header choice —
        // COMPANY identity hides the phone from the document itself, but the
        // freelancer still has a real WhatsApp number to notify once the
        // client sends the acompte (see the post-validation modal).
        providerPhone: invoiceUser.phone,
        brandColor: invoiceUser.brandColor,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
