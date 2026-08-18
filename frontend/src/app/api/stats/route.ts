// Statistiques — deeper analysis than the 4 Dashboard StatCards: 12-month
// trend, revenue split by project type, top clients, and rule-based
// suggestions. Every number here is a real Prisma aggregate; "suggestions"
// are deterministic if/then rules over those aggregates, never a fabricated
// or AI-branded insight — same anti-fabrication stance as
// app/api/dashboard/stats/route.ts (see its header comment).
//
// "On-time payment rate" was deliberately left out: Invoice has no
// paidAt timestamp, so there's no honest way to tell whether a PAID
// invoice was ever OVERDUE first. `overdueRate` (current OVERDUE share of
// non-draft invoices) is used instead — a real snapshot, not a fabricated
// history.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { monthRange, percentTrend, monthBucketKey } from '@/lib/server/stats/helpers';
import { PROJECT_TYPE_LABELS, type ProjectType } from '@/lib/constants';
import { getDefaultCurrency } from '@/lib/server/fx/validateExchangeRate';
import { getCachedRates } from '@/lib/server/fx/rates';
import { sumConverted, type ConvertibleRow } from '@/lib/server/fx/convert';

const REVENUE_TREND_MONTHS = 12;
const STALE_QUOTE_DAYS = 14;

interface Suggestion {
  severity: 'info' | 'warning';
  message: string;
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
    const staleQuoteCutoff = new Date(Date.now() - STALE_QUOTE_DAYS * 24 * 60 * 60 * 1000);

    const invoiceRowSelect = { amount: true, currency: true, exchangeRateToDefault: true } as const;

    const [
      defaultCurrency,
      liveRates,
      revenueThisMonthRows,
      revenueLastMonthRows,
      nonDraftInvoicesCount,
      overdueInvoicesCount,
      staleQuotesCount,
      deliveredProjects,
      paidInvoicesForClients,
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
      prisma.invoice.count({
        where: { userId, docType: 'INVOICE', status: { in: ['SENT', 'PAID', 'OVERDUE'] } },
      }),
      prisma.invoice.count({ where: { userId, docType: 'INVOICE', status: 'OVERDUE' } }),
      prisma.invoice.count({
        where: { userId, docType: 'QUOTE', status: 'SENT', createdAt: { lt: staleQuoteCutoff } },
      }),
      prisma.project.findMany({
        where: { userId, status: 'DELIVERED' },
        select: { type: true, amount: true, currency: true, exchangeRateToDefault: true },
      }),
      prisma.invoice.findMany({
        where: { userId, docType: 'INVOICE', status: 'PAID' },
        select: { clientId: true, amount: true, currency: true, exchangeRateToDefault: true },
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
    const trendPercent = percentTrend(
      revenueThisMonth.amountDefault,
      revenueLastMonth.amountDefault,
    );

    // Same bucketing approach as the dashboard trend — single findMany +
    // in-memory grouping, just widened to 12 months for a real annual view.
    // Buckets hold raw rows (not pre-summed numbers) so each bucket can be
    // converted per-row via its own frozen rate, same as the dashboard.
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

    // Convert each delivered project's amount into defaultCurrency before
    // bucketing by type — a raw sum would mix XOF/EUR/USD amounts together.
    const projectsByType = new Map<string, ConvertibleRow[]>();
    for (const p of deliveredProjects) {
      const rows = projectsByType.get(p.type) ?? [];
      rows.push(p);
      projectsByType.set(p.type, rows);
    }
    const typeTotals = new Map<string, { amount: number; count: number }>();
    for (const [type, rows] of projectsByType) {
      typeTotals.set(type, {
        amount: sumConverted(rows, defaultCurrency, rates).amountDefault,
        count: rows.length,
      });
    }
    const totalDeliveredAmount = Array.from(typeTotals.values()).reduce(
      (sum, { amount }) => sum + amount,
      0,
    );
    const revenueByProjectType = Array.from(typeTotals.entries())
      .map(([type, { amount, count }]) => ({
        type,
        label: PROJECT_TYPE_LABELS[type as ProjectType] ?? type,
        amount,
        count,
        sharePercent:
          totalDeliveredAmount > 0 ? Math.round((amount / totalDeliveredAmount) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Convert each client's paid invoices into defaultCurrency before
    // ranking — a groupBy(['clientId'])._sum would mix currencies together
    // and could rank a client wrong.
    const invoicesByClient = new Map<string, ConvertibleRow[]>();
    for (const row of paidInvoicesForClients) {
      const rows = invoicesByClient.get(row.clientId) ?? [];
      rows.push(row);
      invoicesByClient.set(row.clientId, rows);
    }
    const rankedClientTotals = Array.from(invoicesByClient.entries())
      .map(([clientId, rows]) => ({
        clientId,
        amount: sumConverted(rows, defaultCurrency, rates).amountDefault,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const clientIds = rankedClientTotals.map((c) => c.clientId);
    const clients = clientIds.length
      ? await prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : [];
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
    const topClients = rankedClientTotals.map((c) => ({
      clientId: c.clientId,
      name: clientNameById.get(c.clientId) ?? 'Client',
      amount: c.amount,
    }));

    const avgProjectValue =
      deliveredProjects.length > 0
        ? Math.round(totalDeliveredAmount / deliveredProjects.length)
        : null;
    const overdueRate =
      nonDraftInvoicesCount > 0
        ? Math.round((overdueInvoicesCount / nonDraftInvoicesCount) * 100)
        : null;

    const suggestions: Suggestion[] = [];
    if (overdueInvoicesCount > 0) {
      suggestions.push({
        severity: 'warning',
        message: `${overdueInvoicesCount} facture${overdueInvoicesCount > 1 ? 's' : ''} en retard de paiement — une relance rapide limite le risque d'impayé.`,
      });
    }
    if (staleQuotesCount > 0) {
      suggestions.push({
        severity: 'warning',
        message: `${staleQuotesCount} devis envoyé${staleQuotesCount > 1 ? 's' : ''} depuis plus de ${STALE_QUOTE_DAYS} jours sans réponse — relancez pour ne pas perdre le client.`,
      });
    }
    if (trendPercent != null && trendPercent < 0) {
      suggestions.push({
        severity: 'warning',
        message: `Le chiffre d'affaires a baissé de ${Math.abs(trendPercent)}% par rapport au mois dernier.`,
      });
    }
    const dominantType = revenueByProjectType[0];
    if (dominantType && dominantType.sharePercent >= 50) {
      suggestions.push({
        severity: 'info',
        message: `${dominantType.sharePercent}% du chiffre d'affaires livré provient de projets « ${dominantType.label} » — une spécialité à mettre en avant dans votre offre.`,
      });
    }

    return NextResponse.json(
      {
        overview: {
          revenue: {
            amount: revenueThisMonth.amountDefault,
            currency: defaultCurrency,
            amountsByCurrency: revenueThisMonth.amountsByCurrency,
            trendPercent,
          },
          avgProjectValue:
            avgProjectValue != null ? { amount: avgProjectValue, currency: defaultCurrency } : null,
          overdueRate,
        },
        revenueByProjectType,
        topClients,
        revenueTrend,
        suggestions,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
