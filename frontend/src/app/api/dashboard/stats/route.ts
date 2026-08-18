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
import { monthRange, percentTrend, monthBucketKey } from '@/lib/server/stats/helpers';
import { getDefaultCurrency } from '@/lib/server/fx/validateExchangeRate';
import { getCachedRates } from '@/lib/server/fx/rates';
import { sumConverted, type ConvertibleRow } from '@/lib/server/fx/convert';

const REVENUE_TREND_MONTHS = 6;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.sub;

    const thisMonth = monthRange(0);
    const lastMonth = monthRange(1);
    const trendStart = monthRange(REVENUE_TREND_MONTHS - 1).start;

    const invoiceRowSelect = { amount: true, currency: true, exchangeRateToDefault: true } as const;

    const [
      defaultCurrency,
      liveRates,
      revenueThisMonthRows,
      revenueLastMonthRows,
      activeProjectsCount,
      pendingInvoicesRows,
      overdueInvoicesCount,
      newClientsThisMonthCount,
      newClientsLastMonthCount,
      revenueTrendRows,
    ] = await Promise.all([
      getDefaultCurrency(prisma, userId),
      getCachedRates(),
      prisma.invoice.findMany({
        where: {
          userId,
          docType: 'INVOICE',
          status: 'PAID',
          issueDate: { gte: thisMonth.start, lt: thisMonth.end },
        },
        select: invoiceRowSelect,
      }),
      prisma.invoice.findMany({
        where: {
          userId,
          docType: 'INVOICE',
          status: 'PAID',
          issueDate: { gte: lastMonth.start, lt: lastMonth.end },
        },
        select: invoiceRowSelect,
      }),
      prisma.project.count({ where: { userId, status: { notIn: ['DELIVERED', 'DRAFT'] } } }),
      prisma.invoice.findMany({
        // docType: 'INVOICE' is required here — a devis (QUOTE) can also sit
        // at status SENT (see the devis lifecycle in lib/constants.ts), but
        // it isn't money owed yet, so it must never inflate this figure.
        where: { userId, docType: 'INVOICE', status: { in: ['SENT', 'OVERDUE'] } },
        select: invoiceRowSelect,
      }),
      prisma.invoice.count({ where: { userId, docType: 'INVOICE', status: 'OVERDUE' } }),
      prisma.client.count({
        where: { userId, createdAt: { gte: thisMonth.start, lt: thisMonth.end } },
      }),
      prisma.client.count({
        where: { userId, createdAt: { gte: lastMonth.start, lt: lastMonth.end } },
      }),
      prisma.invoice.findMany({
        where: { userId, docType: 'INVOICE', status: 'PAID', issueDate: { gte: trendStart } },
        select: { amount: true, currency: true, exchangeRateToDefault: true, issueDate: true },
      }),
    ]);

    // sumConverted takes a plain numeric rates record — CachedFxRates also
    // carries `fetchedAt: string`, which isn't a rate.
    const rates: Record<string, number> = {
      XOF: liveRates.XOF,
      EUR: liveRates.EUR,
      USD: liveRates.USD,
    };

    const revenueThisMonth = sumConverted(revenueThisMonthRows, defaultCurrency, rates);
    const revenueLastMonth = sumConverted(revenueLastMonthRows, defaultCurrency, rates);
    const pendingInvoices = sumConverted(pendingInvoicesRows, defaultCurrency, rates);

    // Bucket the raw PAID invoices into REVENUE_TREND_MONTHS calendar-month
    // buckets (oldest first) — a single findMany + in-memory grouping instead
    // of N separate aggregate() round trips. Converted to defaultCurrency
    // per row before bucketing (stable — uses each row's own frozen rate).
    const buckets = new Map<string, ConvertibleRow[]>();
    for (let i = REVENUE_TREND_MONTHS - 1; i >= 0; i--) {
      buckets.set(monthBucketKey(monthRange(i).start), []);
    }
    for (const row of revenueTrendRows) {
      const key = monthBucketKey(new Date(row.issueDate));
      buckets.get(key)?.push(row);
    }
    const revenueTrend = Array.from(buckets.entries()).map(([month, rows]) => ({
      month,
      amount: sumConverted(rows, defaultCurrency, rates).amountDefault,
    }));

    return NextResponse.json(
      {
        revenue: {
          amount: revenueThisMonth.amountDefault,
          currency: defaultCurrency,
          amountsByCurrency: revenueThisMonth.amountsByCurrency,
          trendPercent: percentTrend(
            revenueThisMonth.amountDefault,
            revenueLastMonth.amountDefault,
          ),
        },
        activeProjects: { count: activeProjectsCount },
        pendingInvoices: {
          amount: pendingInvoices.amountDefault,
          currency: defaultCurrency,
          amountsByCurrency: pendingInvoices.amountsByCurrency,
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
