// Freelance CRM — single-project detail (Phase A follow-up, same 404 gap as
// clients/[id]). Deposit/balance derivation mirrors GET /api/track/[token]'s
// project branch exactly (PAID Orders tagged via `metadata.projectId`) so the
// authenticated dashboard view and the public Client Link Portal never
// disagree on payment status.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeDepositBalance } from '@/lib/server/projects/depositBalance';
import { PROJECT_TYPE_VALUES } from '@/lib/constants';

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  sector: z.string().min(1).max(100).optional(),
  type: z.enum(PROJECT_TYPE_VALUES).optional(),
  description: z.string().max(2000).nullable().optional(),
  amount: z.number().int().positive().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  // Manual override — the only way to move a project's status other than
  // the automatic "last step completed -> DELIVERED" transition (see
  // steps/[stepId]/route.ts). Lets a freelancer reopen a delivered project
  // (or otherwise correct the status) without touching its steps.
  status: z.enum(['IN_PROGRESS', 'PENDING', 'DELIVERED']).optional(),
});

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const project = await prisma.project.findFirst({
      where: { id, userId: auth.user.sub },
      include: {
        client: { select: { id: true, name: true, trackingToken: true } },
        steps: { orderBy: { order: 'asc' } },
        comments: { orderBy: { createdAt: 'asc' } },
        review: { select: { rating: true, comment: true, createdAt: true } },
        invoices: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            number: true,
            docType: true,
            status: true,
            amount: true,
            currency: true,
            dueDate: true,
          },
        },
        files: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            url: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'PROJECT_NOT_FOUND', message: 'Project does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { deposit, balance } = await computeDepositBalance(prisma, project);

    const { steps, comments, review, invoices, files, ...projectFields } = project;
    return NextResponse.json(
      {
        project: projectFields,
        steps,
        comments,
        review: review ?? null,
        invoices,
        files,
        deposit,
        balance,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const existing = await prisma.project.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'PROJECT_NOT_FOUND', message: 'Project does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const { name, sector, type, description, amount, dueDate, status } = parsed.data;

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(sector !== undefined ? { sector } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    return NextResponse.json(project, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
