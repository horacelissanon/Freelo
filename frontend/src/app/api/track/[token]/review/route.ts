// Public, unauthenticated review submission on the Client Link Portal.
// Scoped to a single project via its `publicToken` — the token IS the
// authorization, same pattern as /api/track/[token]/comments. Only
// submittable once the project is DELIVERED (asking for a review on
// unfinished work doesn't make sense). Upsert on projectId — unlike
// Invoice's frozen-once-sent invariant, a client can come back and revise
// their rating/comment, so re-posting updates the existing row instead of
// erroring.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { enforceTokenRateLimit } from '@/lib/server/middleware/rate-limit-by-token';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

const RATE_LIMIT_PREFIX = 'rl:track:review:';
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
        userId: true,
        clientId: true,
        status: true,
        user: { select: { publicPortalEnabled: true } },
      },
    });
    if (!project || !project.user.publicPortalEnabled) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Lien de suivi invalide ou expiré.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (project.status !== 'DELIVERED') {
      return NextResponse.json(
        {
          error: 'PROJECT_NOT_DELIVERED',
          message: 'Un avis ne peut être laissé qu’une fois le projet livré.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const review = await prisma.review.upsert({
      where: { projectId: project.id },
      update: { rating: parsed.data.rating, comment: parsed.data.comment ?? null },
      create: {
        projectId: project.id,
        userId: project.userId,
        clientId: project.clientId,
        rating: parsed.data.rating,
        comment: parsed.data.comment ?? null,
      },
      select: { rating: true, comment: true },
    });

    return NextResponse.json(review, {
      status: 200,
      headers: { 'x-request-id': reqCtx.requestId },
    });
  });
}
