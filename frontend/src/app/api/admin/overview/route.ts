// ADMIN-08 — GET /api/admin/overview — platform-wide stats for the Super
// Admin "Vue d'ensemble" landing page.
//
// Every number here is a real aggregate — nothing fabricated:
//   - mrr sums ACTIVE PRO subscriptions via the live, Super Admin-editable
//     PlanConfig (billing/plans.ts's getPlanConfig), normalizing YEARLY to a
//     monthly-equivalent (amount / 12).
//   - mrrTrendDelta compares the last two buckets of revenueTrend (real paid
//     SubscriptionTransaction sums) — % change month-over-month.
//   - dau counts distinct Session.userId with lastSeenAt in the last 24h and
//     no revokedAt (Session is the only activity-timestamped model available).
//   - churnRate = Subscriptions that flipped to CANCELED/EXPIRED this month
//     (via `updatedAt`, the closest proxy available — there's no status-
//     change history table yet) / Subscriptions that were ever PRO and
//     existed before this month. A real but approximate definition; documented
//     here rather than silently precise-looking.
//   - revenueTrend groups PAID SubscriptionTransaction rows by calendar month
//     for the trailing 6 months (real Merrudit SaaS revenue, not Order/
//     Withdrawal — those are end-client payments to freelancers, a different
//     money flow, not surfaced anywhere in the admin console).
//   - recentFailedPayments mirrors what /admin/transactions shows in full —
//     same SubscriptionTransaction model, status=FAILED.
//   - systemHealth mirrors the same pending/dead counts the Outbox and
//     Email-queue admin list endpoints expose in full, plus an active-lockout
//     count from the same Redis prefix /api/admin/rate-limits scans, plus
//     open/critical AdminAlert counts (see /api/admin/alerts for the full feed).
//
// Queries run SEQUENTIALLY, not Promise.all — this dev DB's connection pool
// caps at connection_limit=1 (Neon), and firing a dozen-plus queries at once
// queues them all for the single connection simultaneously, blowing past the
// pool's 15s acquire timeout (P2024) well before any of them even start.
// Sequential awaits mean each query only ever waits on the one before it.
// Also collapsed pairs of same-model counts (outbox/email pending+dead,
// ticket open+urgent) into a single groupBy/findMany each, to cut the total
// query count regardless of pool size.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPlanConfig } from '@/lib/server/billing/plans';
import { isProActive } from '@/lib/server/billing/subscription';

const LOCKOUT_HARD_CAP = 1000;

async function countLockouts(): Promise<number> {
  if (!redis) return 0;
  let cursor = '0';
  let count = 0;
  do {
    const res = await redis.scan(cursor, { match: 'auth:lockout:*', count: 200 });
    cursor = String(res[0]);
    count += res[1].length;
  } while (cursor !== '0' && count < LOCKOUT_HARD_CAP);
  return count;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const totalUsers = await prisma.user.count();
    const newUsersThisMonth = await prisma.user.count({
      where: { createdAt: { gte: startOfMonth } },
    });
    const activeSubs = await prisma.subscription.findMany({
      where: { plan: 'PRO', status: 'ACTIVE' },
      select: { billingCycle: true },
    });
    const dauRows = await prisma.session.findMany({
      where: { lastSeenAt: { gte: dayAgo }, revokedAt: null },
      select: { userId: true },
      distinct: ['userId'],
    });

    const outboxGroups = await prisma.outboxEvent.groupBy({
      by: ['status'],
      where: { status: { in: ['PENDING', 'DEAD'] } },
      _count: true,
    });
    const outboxPending = outboxGroups.find((g) => g.status === 'PENDING')?._count ?? 0;
    const outboxDead = outboxGroups.find((g) => g.status === 'DEAD')?._count ?? 0;

    const emailGroups = await prisma.emailJob.groupBy({
      by: ['status'],
      where: { status: { in: ['PENDING', 'DEAD'] } },
      _count: true,
    });
    const emailPending = emailGroups.find((g) => g.status === 'PENDING')?._count ?? 0;
    const emailDead = emailGroups.find((g) => g.status === 'DEAD')?._count ?? 0;

    const lockoutCount = await countLockouts();

    const openAlertsCount = await prisma.adminAlert.count({ where: { acknowledgedAt: null } });
    const criticalAlertsCount = await prisma.adminAlert.count({
      where: { acknowledgedAt: null, severity: 'CRITICAL' },
    });

    const revenueRows = await prisma.subscriptionTransaction.findMany({
      where: { status: 'PAID', createdAt: { gte: sixMonthsAgo } },
      select: { amount: true, createdAt: true },
    });

    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        status: true,
        subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
      },
    });

    const recentFailedPayments = await prisma.subscriptionTransaction.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        amount: true,
        currency: true,
        provider: true,
        createdAt: true,
        subscription: { select: { user: { select: { email: true, name: true } } } },
      },
    });

    const churnedThisMonth = await prisma.subscription.count({
      where: { status: { in: ['CANCELED', 'EXPIRED'] }, updatedAt: { gte: startOfMonth } },
    });
    const everProBeforeThisMonth = await prisma.subscription.count({
      where: { plan: 'PRO', createdAt: { lt: startOfMonth } },
    });

    const openTickets = await prisma.supportTicket.findMany({
      where: { status: 'OPEN' },
      select: { priority: true },
    });
    const openTicketsCount = openTickets.length;
    const urgentOpenTicketsCount = openTickets.filter((t) => t.priority === 'HIGH').length;

    const proConfig = await getPlanConfig(prisma, 'PRO');
    const monthlyEquivalent: Record<string, number> = {
      MONTHLY: proConfig.monthlyAmount ?? 0,
      YEARLY: Math.round((proConfig.yearlyAmount ?? 0) / 12),
    };
    const mrr = activeSubs.reduce(
      (sum, s) => sum + (monthlyEquivalent[s.billingCycle ?? 'MONTHLY'] ?? 0),
      0,
    );

    // Bucket paid transactions into the 6 calendar months ending this month.
    const months: { key: string; label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('fr-FR', { month: 'short' }),
        amount: 0,
      });
    }
    for (const row of revenueRows) {
      const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.amount += row.amount;
    }

    const lastMonth = months[months.length - 2];
    const thisMonth = months[months.length - 1];
    const mrrTrendDelta =
      lastMonth && thisMonth && lastMonth.amount > 0
        ? Math.round(((thisMonth.amount - lastMonth.amount) / lastMonth.amount) * 1000) / 10
        : null;

    const churnRate =
      Math.round((churnedThisMonth / Math.max(1, everProBeforeThisMonth)) * 1000) / 10;

    return NextResponse.json(
      {
        totalUsers,
        newUsersThisMonth,
        activeSubscribers: activeSubs.length,
        // No row means implicit FREE (see billing/subscription.ts) — everyone
        // not counted as an active Pro subscriber is treated as Free here.
        planDistribution: {
          free: Math.max(0, totalUsers - activeSubs.length),
          pro: activeSubs.length,
        },
        mrr,
        mrrCurrency: proConfig.currency,
        mrrTrendDelta,
        churnRate,
        dau: dauRows.length,
        revenueTrend: months.map(({ label, amount }) => ({ label, amount })),
        systemHealth: {
          outboxPending,
          outboxDead,
          emailPending,
          emailDead,
          lockoutCount,
          openAlertsCount,
          criticalAlertsCount,
        },
        support: { openTickets: openTicketsCount, urgentOpenTickets: urgentOpenTicketsCount },
        recentUsers: recentUsers.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          accountStatus: u.status,
          // Same isProActive() definition as planDistribution above — a
          // PRO row stuck at PAST_DUE/CANCELED must read as Gratuit here
          // too, not "Pro" in one card and "Gratuit" in the other.
          plan: u.subscription && isProActive(u.subscription) ? 'PRO' : 'FREE',
          createdAt: u.createdAt.toISOString(),
        })),
        recentFailedPayments: recentFailedPayments.map((p) => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          provider: p.provider,
          createdAt: p.createdAt.toISOString(),
          user: p.subscription.user,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
