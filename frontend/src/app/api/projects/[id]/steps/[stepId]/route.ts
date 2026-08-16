// Freelancer-side step management (Phase C follow-up). Two independent
// actions on one endpoint since both operate on the same step + ownership
// check: `status` flips a step's PENDING/IN_PROGRESS/COMPLETED state
// (auto-stamping/clearing completedAt), `move` swaps `order` with the
// adjacent sibling — a no-op at either boundary rather than an error, since
// "move up the first step" is a normal double-click, not a bug.
// DELETE removes a custom step and renormalizes the remaining steps' `order`
// to stay contiguous (1..N) — `move`'s adjacent-order lookup depends on that.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeProjectProgress } from '@/lib/server/projects/progress';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('status'),
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
  }),
  z.object({
    action: z.literal('move'),
    direction: z.enum(['up', 'down']),
  }),
  z.object({
    action: z.literal('edit'),
    title: z.string().min(1).max(200),
    description: z.string().max(500).nullable().optional(),
  }),
]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; stepId: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id: projectId, stepId } = await ctx.params;

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

    const step = await prisma.projectStep.findFirst({
      where: { id: stepId, projectId },
      select: { id: true, order: true },
    });
    if (!step) {
      return NextResponse.json(
        { error: 'STEP_NOT_FOUND', message: 'Step does not exist on this project' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (parsed.data.action === 'status') {
      await prisma.projectStep.update({
        where: { id: step.id },
        data: {
          status: parsed.data.status,
          completedAt: parsed.data.status === 'COMPLETED' ? new Date() : null,
        },
      });
      // Avancement dérivé du ratio d'étapes validées ; le statut ne bascule
      // automatiquement QUE vers Livré (atteindre 100%) — jamais en arrière
      // si une étape est décochée après coup. Repasser le statut en arrière
      // (rouvrir un projet livré) est un choix manuel explicite, fait
      // depuis la fiche projet (PATCH /api/projects/[id]).
      const allSteps = await prisma.projectStep.findMany({
        where: { projectId },
        select: { status: true },
      });
      const progress = computeProjectProgress(allSteps);
      await prisma.project.update({
        where: { id: projectId },
        data: { progress, ...(progress === 100 ? { status: 'DELIVERED' } : {}) },
      });
    } else if (parsed.data.action === 'edit') {
      await prisma.projectStep.update({
        where: { id: step.id },
        data: {
          title: parsed.data.title,
          description: parsed.data.description || null,
        },
      });
    } else {
      const neighborOrder = parsed.data.direction === 'up' ? step.order - 1 : step.order + 1;
      const neighbor = await prisma.projectStep.findFirst({
        where: { projectId, order: neighborOrder },
        select: { id: true, order: true },
      });
      if (neighbor) {
        await prisma.$transaction([
          prisma.projectStep.update({ where: { id: step.id }, data: { order: neighbor.order } }),
          prisma.projectStep.update({ where: { id: neighbor.id }, data: { order: step.order } }),
        ]);
      }
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; stepId: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id: projectId, stepId } = await ctx.params;

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

    const step = await prisma.projectStep.findFirst({
      where: { id: stepId, projectId },
      select: { id: true },
    });
    if (!step) {
      return NextResponse.json(
        { error: 'STEP_NOT_FOUND', message: 'Step does not exist on this project' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const remaining = await prisma.projectStep.findMany({
      where: { projectId, id: { not: stepId } },
      orderBy: [{ order: 'asc' }],
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.projectStep.delete({ where: { id: stepId } }),
      ...remaining.map((s, index) =>
        prisma.projectStep.update({ where: { id: s.id }, data: { order: index + 1 } }),
      ),
    ]);

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
