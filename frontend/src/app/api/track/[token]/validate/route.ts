// Public, unauthenticated devis validation on the Client Link Portal
// (Phase C extension). QUOTE only — the client accepts the quote they were
// sent, flipping SENT -> ACCEPTED. The token IS the authorization, same
// pattern as /pay and /comments. No online payment happens here (per
// product decision, payment methods shown on a devis are indicative-only —
// the real acompte/solde payment flow lives at the Project level).
//
// Offers are mutually exclusive alternatives, not line items to sum — a
// devis with several packs asks the client to pick ONE, so this endpoint
// requires a packId identifying which InvoicePack they chose. That choice
// is stored on Invoice.selectedPackId and becomes the devis's real value
// (Invoice.amount is reset to that pack's own total — no more grand total
// summed across offers the client never agreed to pay for).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { computeItemsTotal } from '@/lib/invoiceTotals';
import { enforceTokenRateLimit } from '@/lib/server/middleware/rate-limit-by-token';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ValidateBody = z.object({ packId: z.string().min(1) });

const RATE_LIMIT_PREFIX = 'rl:track:validate:';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_HITS = 10;

export async function POST(
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

    const invoice = await prisma.invoice.findUnique({
      where: { trackingToken: token },
      select: {
        id: true,
        docType: true,
        status: true,
        user: { select: { publicPortalEnabled: true } },
        packs: { select: { id: true, items: { select: { quantity: true, unitPrice: true } } } },
      },
    });
    if (!invoice || !invoice.user.publicPortalEnabled || invoice.status === 'DRAFT') {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Lien de suivi invalide ou expiré.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (invoice.docType !== 'QUOTE') {
      return NextResponse.json(
        { error: 'NOT_A_QUOTE', message: 'Seul un devis peut être validé.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (invoice.status !== 'SENT') {
      return NextResponse.json(
        { error: 'QUOTE_NOT_PENDING', message: 'Ce devis a déjà été traité.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = ValidateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Choisissez une offre avant de valider ce devis.' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const selectedPack = invoice.packs.find((p) => p.id === parsed.data.packId);
    if (!selectedPack) {
      return NextResponse.json(
        { error: 'PACK_NOT_FOUND', message: "Cette offre n'existe pas pour ce devis." },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const selectedAmount = computeItemsTotal(selectedPack.items);

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'ACCEPTED', selectedPackId: selectedPack.id, amount: selectedAmount },
      select: { id: true, status: true, selectedPackId: true, amount: true },
    });

    return NextResponse.json(updated, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
