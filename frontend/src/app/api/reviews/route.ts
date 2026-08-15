// Freelance-facing list of client reviews collected via the Client Link
// Portal (see /api/track/[token]/review for the public submission side).
// Cursor-paginated the same way as the other authenticated listings
// (lib/server/pagination/paginate.ts) plus an average/count aggregate over
// the FULL set (not just the current page) so the UI can show "4.6/5 sur
// 12 avis" without the client having to walk every page first.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, decodeCursor, cursorWhere, buildPage } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where = { userId: auth.user.sub, ...cursorWhere(cursor) };

    const [rows, aggregate] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.review.aggregate({
        where: { userId: auth.user.sub },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    const page = buildPage(rows, limit);

    return NextResponse.json(
      {
        ...page,
        average: aggregate._avg.rating,
        total: aggregate._count,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
