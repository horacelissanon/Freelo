// Freelance CRM (Banani "Espace Freelance Merrudit" import, Phase A —
// see .planning/banani/IMPLEMENTATION-PLAN.md). Feeds the 4 Dashboard
// StatCards. Returns raw numeric data only — French labels/formatting
// belong in the frontend layer, not the API (per the banani-design-
// implementation skill's copy/i18n rule).
//
// `activeProjects` and `pendingInvoices` are point-in-time counts with no
// historical snapshot to diff against, so they intentionally have no
// `trend` field rather than fabricating a misleading number. `revenue`
// and `newClients` compare against the prior calendar month, which is a
// real comparison we can compute from `createdAt`/`issueDate`.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function monthRange(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 1));
  return { start, end };
}

function percentTrend(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const REVENUE_TREND_MONTHS = 6;

function monthBucketKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.sub;

    const thisMonth = monthRange(0);
    const lastMonth = monthRange(1);
    const trendStart = monthRange(REVENUE_TREND_MONTHS - 1).start;

    const [
      revenueThisMonthAgg,
      revenueLastMonthAgg,
      activeProjectsCount,
      pendingInvoicesAgg,
      overdueInvoicesCount,
      newClientsThisMonthCount,
      newClientsLastMonthCount,
      revenueTrendRows,
    ] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          userId,
          docType: 'INVOICE',
          status: 'PAID',
          issueDate: { gte: thisMonth.start, lt: thisMonth.end },
        },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: {
          userId,
          docType: 'INVOICE',
          status: 'PAID',
          issueDate: { gte: lastMonth.start, lt: lastMonth.end },
        },
        _sum: { amount: true },
      }),
      prisma.project.count({ where: { userId, status: 'IN_PROGRESS' } }),
      prisma.invoice.aggregate({
        where: { userId, status: { in: ['SENT', 'OVERDUE'] } },
        _sum: { amount: true },
      }),
      prisma.invoice.count({ where: { userId, status: 'OVERDUE' } }),
      prisma.client.count({
        where: { userId, createdAt: { gte: thisMonth.start, lt: thisMonth.end } },
      }),
      prisma.client.count({
        where: { userId, createdAt: { gte: lastMonth.start, lt: lastMonth.end } },
      }),
      prisma.invoice.findMany({
        where: { userId, docType: 'INVOICE', status: 'PAID', issueDate: { gte: trendStart } },
        select: { amount: true, issueDate: true },
      }),
    ]);

    const revenueThisMonth = revenueThisMonthAgg._sum.amount ?? 0;
    const revenueLastMonth = revenueLastMonthAgg._sum.amount ?? 0;

    // Bucket the raw PAID invoices into REVENUE_TREND_MONTHS calendar-month
    // buckets (oldest first) — a single findMany + in-memory grouping instead
    // of N separate aggregate() round trips.
    const buckets = new Map<string, number>();
    for (let i = REVENUE_TREND_MONTHS - 1; i >= 0; i--) {
      buckets.set(monthBucketKey(monthRange(i).start), 0);
    }
    for (const row of revenueTrendRows) {
      const key = monthBucketKey(new Date(row.issueDate));
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + row.amount);
      }
    }
    const revenueTrend = Array.from(buckets.entries()).map(([month, amount]) => ({
      month,
      amount,
    }));

    return NextResponse.json(
      {
        revenue: {
          amount: revenueThisMonth,
          currency: 'XOF',
          trendPercent: percentTrend(revenueThisMonth, revenueLastMonth),
        },
        activeProjects: { count: activeProjectsCount },
        pendingInvoices: {
          amount: pendingInvoicesAgg._sum.amount ?? 0,
          currency: 'XOF',
          overdueCount: overdueInvoicesCount,
        },
        newClients: {
          count: newClientsThisMonthCount,
          trend: newClientsThisMonthCount - newClientsLastMonthCount,
        },
        revenueTrend,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
