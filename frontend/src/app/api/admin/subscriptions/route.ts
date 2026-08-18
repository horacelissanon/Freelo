// ADMIN-09 — GET /api/admin/subscriptions (list with plan/status filters,
// cursor pagination). Mirrors the users-list pattern (ADMIN-01) and joins
// the owning User's identity fields so the Super Admin UI doesn't need a
// second round-trip per row.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SUBSCRIPTION_SELECT = {
  id: true,
  userId: true,
  plan: true,
  status: true,
  billingCycle: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  createdAt: true,
  user: { select: { email: true, name: true } },
} as const satisfies Prisma.SubscriptionSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const plan = url.searchParams.get('plan');
    const status = url.searchParams.get('status');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.SubscriptionWhereInput = {
      ...(plan ? { plan } : {}),
      ...(status ? { status } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.subscription.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: SUBSCRIPTION_SELECT,
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(page, { headers: { 'x-request-id': ctx.requestId } });
  });
}
