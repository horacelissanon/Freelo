// Public, unauthenticated comment posting on the Client Link Portal
// (Phase C). Scoped to a single project via its `publicToken` — the token
// IS the authorization, so `author` is always forced to CLIENT here
// (a public caller can never post as FREELANCER). Rate-limited per token
// since there's no session/IP to key on otherwise.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { enforceTokenRateLimit } from '@/lib/server/middleware/rate-limit-by-token';
import { isProActive } from '@/lib/server/billing/subscription';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  body: z.string().min(1).max(2000),
});

const RATE_LIMIT_PREFIX = 'rl:track:comment:';
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

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const project = await prisma.project.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        user: {
          select: {
            publicPortalEnabled: true,
            subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
          },
        },
      },
    });
    if (!project || !project.user.publicPortalEnabled) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Lien de suivi invalide ou expiré.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (
      !isProActive(
        project.user.subscription ?? { plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null },
      )
    ) {
      return NextResponse.json(
        {
          error: 'PLAN_REQUIRES_PRO',
          message: 'Les commentaires sont réservés aux freelances en plan Pro.',
        },
        { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const comment = await prisma.projectComment.create({
      data: {
        projectId: project.id,
        author: 'CLIENT',
        body: parsed.data.body,
      },
    });

    return NextResponse.json(comment, {
      status: 201,
      headers: { 'x-request-id': reqCtx.requestId },
    });
  });
}
