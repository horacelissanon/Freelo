// Public, unauthenticated devis validation on the Client Link Portal
// (Phase C extension). QUOTE only — the client accepts the quote they were
// sent, flipping SENT -> ACCEPTED. The token IS the authorization, same
// pattern as /pay and /comments. No online payment happens here (per
// product decision, payment methods shown on a devis are indicative-only —
// the real acompte/solde payment flow lives at the Project level).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { enforceTokenRateLimit } from '@/lib/server/middleware/rate-limit-by-token';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'ACCEPTED' },
      select: { id: true, status: true },
    });

    return NextResponse.json(updated, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
