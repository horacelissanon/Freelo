// Freelancer-facing support ticket submission + own-ticket listing.
// Paramètres → Support (SupportTab.tsx) is the only consumer today. Tickets
// land straight in the DB — no outbound admin notification wired yet (no
// admin distribution list configured), so triage happens from the Super
// Admin console (/admin/support) whenever an admin checks in, same as any
// other admin-visibility surface in this app.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, decodeCursor, cursorWhere, buildPage } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(5000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const rows = await prisma.supportTicket.findMany({
      where: { userId: auth.user.sub, ...cursorWhere(cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        subject: true,
        message: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(buildPage(rows, limit), {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: auth.user.sub,
        subject: parsed.data.subject,
        message: parsed.data.message,
        priority: parsed.data.priority ?? 'MEDIUM',
      },
      select: {
        id: true,
        subject: true,
        message: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { ticket },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
