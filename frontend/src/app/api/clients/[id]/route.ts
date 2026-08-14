// Freelance CRM — single-client detail (Phase A follow-up: the dashboard
// linked to /clients/[id] from day one but this route didn't exist, so the
// page 404'd). Scoped to `auth.user.sub` like the list route — a client
// belonging to another user resolves as 404, not 403, to avoid leaking
// existence.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const client = await prisma.client.findFirst({
      where: { id, userId: auth.user.sub },
      include: {
        projects: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            name: true,
            status: true,
            progress: true,
            amount: true,
            currency: true,
            step: true,
            dueDate: true,
            publicToken: true,
          },
        },
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
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND', message: 'Client does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(client, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
