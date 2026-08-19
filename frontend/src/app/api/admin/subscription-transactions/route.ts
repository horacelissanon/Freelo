// ADMIN-11 — GET /api/admin/subscription-transactions (list with status
// filter, cursor pagination). This is the SaaS's OWN revenue — a freelancer
// paying Merrudit for their Pro subscription — distinct from Order (an end
// CLIENT paying a freelancer, surfaced separately on /api/admin/orders,
// which is no longer wired to any admin page). Mirrors the
// subscriptions-list pattern (ADMIN-09).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SUBSCRIPTION_TRANSACTION_SELECT = {
  id: true,
  amount: true,
  currency: true,
  billingCycle: true,
  status: true,
  provider: true,
  periodStart: true,
  periodEnd: true,
  createdAt: true,
  subscription: { select: { user: { select: { email: true, name: true } } } },
} as const satisfies Prisma.SubscriptionTransactionSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.SubscriptionTransactionWhereInput = {
      ...(status ? { status } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.subscriptionTransaction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: SUBSCRIPTION_TRANSACTION_SELECT,
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(page, { headers: { 'x-request-id': ctx.requestId } });
  });
}
