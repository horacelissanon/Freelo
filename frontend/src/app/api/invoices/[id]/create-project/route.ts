// Devis → Project conversion, once a client has accepted the quote. Mirrors
// credit-note/route.ts's shape: ownership check → business guards → create
// the new resource AND mutate the original inside one $transaction so the
// two rows never disagree (a Project can't exist without the Invoice
// pointing at it, or vice versa).
//
// `clientId` is deliberately absent from the request body — the resulting
// project always belongs to whichever client actually validated this devis,
// derived server-side from the Invoice row itself, never trusted from the
// caller.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { createProject } from '@/lib/server/projects/createProject';
import {
  getOrCreateSubscription,
  isProActive,
  FREE_PLAN_LIMITS,
} from '@/lib/server/billing/subscription';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  name: z.string().min(1).max(200),
  type: z
    .enum(['LOGO', 'IDENTITY', 'POSTER', 'PACKAGING', 'SOCIAL', 'PRINT', 'UI_WEB', 'OTHER'])
    .default('OTHER'),
  description: z.string().max(2000).optional(),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default('XOF'),
  dueDate: z.string().datetime().optional(),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(20)
    .optional(),
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

    const { id } = await ctx.params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true, clientId: true, docType: true, status: true, projectId: true },
    });
    if (!invoice) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND', message: 'Invoice does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (invoice.docType !== 'QUOTE') {
      return NextResponse.json(
        { error: 'NOT_A_QUOTE', message: 'Seul un devis peut être converti en projet.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (invoice.status !== 'ACCEPTED') {
      return NextResponse.json(
        {
          error: 'QUOTE_NOT_ACCEPTED',
          message: 'Le devis doit être accepté par le client avant de créer un projet.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (invoice.projectId) {
      return NextResponse.json(
        { error: 'PROJECT_ALREADY_EXISTS', message: 'Un projet est déjà rattaché à ce devis.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
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

    const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
    if (!isProActive(subscription)) {
      if (parsed.data.currency !== 'XOF') {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_CURRENCY',
            message: 'Le plan Gratuit ne permet que la devise XOF. Passe en Pro pour EUR/USD.',
          },
          { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      const activeProjectCount = await prisma.project.count({
        where: { userId: auth.user.sub, status: 'IN_PROGRESS' },
      });
      if (activeProjectCount >= FREE_PLAN_LIMITS.maxActiveProjects) {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_PROJECTS',
            message: `Le plan Gratuit est limité à ${FREE_PLAN_LIMITS.maxActiveProjects} projets actifs. Passe en Pro pour en créer davantage.`,
          },
          { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await createProject(tx, {
        userId: auth.user.sub,
        clientId: invoice.clientId,
        name: parsed.data.name,
        type: parsed.data.type,
        status: 'IN_PROGRESS',
        progress: 0,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        ...(parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {}),
        ...(parsed.data.steps ? { steps: parsed.data.steps } : {}),
      });
      await tx.invoice.update({ where: { id: invoice.id }, data: { projectId: created.id } });
      return created;
    });

    return NextResponse.json(project, {
      status: 201,
      headers: { 'x-request-id': reqCtx.requestId },
    });
  });
}
