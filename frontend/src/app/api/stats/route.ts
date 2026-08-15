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

    const [
      revenueThisMonthAgg,
      revenueLastMonthAgg,
      avgProjectAgg,
      nonDraftInvoicesCount,
      overdueInvoicesCount,
      staleQuotesCount,
      deliveredProjects,
      topClientsGrouped,
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
      prisma.project.aggregate({ where: { userId, status: 'DELIVERED' }, _avg: { amount: true } }),
      prisma.invoice.count({
        where: { userId, docType: 'INVOICE', status: { in: ['SENT', 'PAID', 'OVERDUE'] } },
      }),
      prisma.invoice.count({ where: { userId, docType: 'INVOICE', status: 'OVERDUE' } }),
      prisma.invoice.count({
        where: { userId, docType: 'QUOTE', status: 'SENT', createdAt: { lt: staleQuoteCutoff } },
      }),
      prisma.project.findMany({
        where: { userId, status: 'DELIVERED' },
        select: { type: true, amount: true },
      }),
      prisma.invoice.groupBy({
        by: ['clientId'],
        where: { userId, docType: 'INVOICE', status: 'PAID' },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      prisma.invoice.findMany({
        where: { userId, docType: 'INVOICE', status: 'PAID', issueDate: { gte: trendStart } },
        select: { amount: true, issueDate: true },
      }),
    ]);

    const revenueThisMonth = revenueThisMonthAgg._sum.amount ?? 0;
    const revenueLastMonth = revenueLastMonthAgg._sum.amount ?? 0;
    const trendPercent = percentTrend(revenueThisMonth, revenueLastMonth);

    // Same bucketing approach as the dashboard trend — single findMany +
    // in-memory grouping, just widened to 12 months for a real annual view.
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

    const typeTotals = new Map<string, { amount: number; count: number }>();
    for (const p of deliveredProjects) {
      const entry = typeTotals.get(p.type) ?? { amount: 0, count: 0 };
      entry.amount += p.amount;
      entry.count += 1;
      typeTotals.set(p.type, entry);
    }
    const totalDeliveredAmount = deliveredProjects.reduce((sum, p) => sum + p.amount, 0);
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

    const clientIds = topClientsGrouped.map((g) => g.clientId);
    const clients = clientIds.length
      ? await prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : [];
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
    const topClients = topClientsGrouped
      .map((g) => ({
        clientId: g.clientId,
        name: clientNameById.get(g.clientId) ?? 'Client',
        amount: g._sum.amount ?? 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const avgProjectValue =
      avgProjectAgg._avg.amount != null ? Math.round(avgProjectAgg._avg.amount) : null;
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
          revenue: { amount: revenueThisMonth, currency: 'XOF', trendPercent },
          avgProjectValue:
            avgProjectValue != null ? { amount: avgProjectValue, currency: 'XOF' } : null,
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
