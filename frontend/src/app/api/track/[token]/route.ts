// Public, unauthenticated project-tracking endpoint (Client Link Portal,
// Phase C). One `token` param resolves against EITHER a Client.trackingToken
// (client shares one link, sees all their projects) or a Project.publicToken
// (a single project's rich detail: steps, comments, deposit/balance status).
// The token IS the authorization — no login/CSRF involved. Read-only.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

interface PaidOrderMeta {
  projectId?: string;
  docType?: 'DEPOSIT' | 'BALANCE';
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { token } = await ctx.params;

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
        user: { select: { publicPortalEnabled: true } },
        projects: {
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
      },
    });

    if (client) {
      if (!client.user.publicPortalEnabled) return notFound();
      return NextResponse.json(
        { kind: 'client', client: { name: client.name }, projects: client.projects },
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
        depositPercent: true,
        createdAt: true,
        client: { select: { name: true } },
        user: { select: { publicPortalEnabled: true } },
        steps: { orderBy: { order: 'asc' } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!project || !project.user.publicPortalEnabled) {
      return notFound();
    }

    // Deposit/balance status is derived from PAID Orders tagged with this
    // project in `metadata` — no dedicated payment table (reuses the
    // existing Order model rather than inventing a parallel one). Filtered
    // at the DB level via a JSON path match, not loaded-then-filtered.
    const paidOrders = await prisma.order.findMany({
      where: { status: 'PAID', metadata: { path: ['projectId'], equals: project.id } },
      select: { metadata: true },
    });
    const paidKinds = new Set(
      paidOrders.map((o) => (o.metadata as PaidOrderMeta | null)?.docType).filter(Boolean),
    );

    const depositAmount = Math.round((project.amount * project.depositPercent) / 100);
    const balanceAmount = project.amount - depositAmount;

    const { steps, comments, client: projectClient, user, ...projectFields } = project;
    void user; // consumed above for the publicPortalEnabled gate; excluded from the response
    return NextResponse.json(
      {
        kind: 'project',
        project: { ...projectFields, client: { name: projectClient.name } },
        steps,
        comments,
        deposit: { amount: depositAmount, paid: paidKinds.has('DEPOSIT') },
        balance: { amount: balanceAmount, paid: paidKinds.has('BALANCE') },
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
