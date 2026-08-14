// Freelancer-side step authoring — appends a custom step to an existing
// project's checklist (order = current count + 1). Sibling to
// [stepId]/route.ts, which handles status/move/delete on a single step.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
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

    const count = await prisma.projectStep.count({ where: { projectId } });
    const step = await prisma.projectStep.create({
      data: {
        projectId,
        order: count + 1,
        title: parsed.data.title,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
      },
    });

    return NextResponse.json(step, { status: 201, headers: { 'x-request-id': reqCtx.requestId } });
  });
}
