// Freelancer-side reply on a project's comment thread (Phase C follow-up —
// the public Client Link Portal already lets the client post as CLIENT;
// this is the authenticated counterpart so the freelancer can reply as
// FREELANCER from the project detail page). Ownership-scoped like every
// other /api/projects/[id]/* route.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z
  .object({
    body: z.string().max(2000).default(''),
    attachmentUrl: z.string().url().optional(),
    attachmentType: z.enum(['IMAGE', 'AUDIO']).optional(),
  })
  .refine((d) => d.body.trim().length > 0 || d.attachmentUrl, {
    message: 'body or attachment is required',
  });

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

    const { id: projectId } = await ctx.params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: auth.user.sub },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: 'PROJECT_NOT_FOUND', message: 'Project does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const comment = await prisma.projectComment.create({
      data: {
        projectId,
        author: 'FREELANCER',
        body: parsed.data.body,
        ...(parsed.data.attachmentUrl ? { attachmentUrl: parsed.data.attachmentUrl } : {}),
        ...(parsed.data.attachmentType ? { attachmentType: parsed.data.attachmentType } : {}),
      },
    });

    return NextResponse.json(comment, {
      status: 201,
      headers: { 'x-request-id': reqCtx.requestId },
    });
  });
}
