// ADMIN-08 — GET /api/admin/overview — platform-wide stats for the Super
// Admin "Vue d'ensemble" landing page.
//
// Every number here is a real aggregate — nothing fabricated:
//   - mrr sums ACTIVE PRO subscriptions via PRO_PRICING (billing/subscription.ts),
//     normalizing YEARLY to a monthly-equivalent (amount / 12).
//   - dau counts distinct Session.userId with lastSeenAt in the last 24h and
//     no revokedAt (Session is the only activity-timestamped model available).
//   - revenueTrend groups PAID SubscriptionTransaction rows by calendar month
//     for the trailing 6 months (real Merrudit SaaS revenue, not Order/
//     Withdrawal — those are end-client payments to freelancers, a different
//     money flow, surfaced separately on /api/admin/{orders,withdrawals}).
//   - systemHealth mirrors the same pending/dead counts the Outbox and
//     Email-queue admin list endpoints expose in full, plus an active-lockout
//     count from the same Redis prefix /api/admin/rate-limits scans.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { PRO_PRICING } from '@/lib/server/billing/subscription';

const MONTHLY_EQUIVALENT: Record<string, number> = {
  MONTHLY: PRO_PRICING.MONTHLY.amount,
  YEARLY: Math.round(PRO_PRICING.YEARLY.amount / 12),
};

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

    const [
      totalUsers,
      newUsersThisMonth,
      activeSubs,
      dauRows,
      outboxPending,
      outboxDead,
      emailPending,
      emailDead,
      lockoutCount,
      revenueRows,
      recentUsers,
      recentFailedOrders,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.subscription.findMany({
        where: { plan: 'PRO', status: 'ACTIVE' },
        select: { billingCycle: true },
      }),
      prisma.session.findMany({
        where: { lastSeenAt: { gte: dayAgo }, revokedAt: null },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
      prisma.outboxEvent.count({ where: { status: 'DEAD' } }),
      prisma.emailJob.count({ where: { status: 'PENDING' } }),
      prisma.emailJob.count({ where: { status: 'DEAD' } }),
      countLockouts(),
      prisma.subscriptionTransaction.findMany({
        where: { status: 'PAID', createdAt: { gte: sixMonthsAgo } },
        select: { amount: true, createdAt: true },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, customerEmail: true, amount: true, currency: true, createdAt: true },
      }),
    ]);

    const mrr = activeSubs.reduce(
      (sum, s) => sum + (MONTHLY_EQUIVALENT[s.billingCycle ?? 'MONTHLY'] ?? 0),
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
        mrrCurrency: 'XOF',
        dau: dauRows.length,
        revenueTrend: months.map(({ label, amount }) => ({ label, amount })),
        systemHealth: { outboxPending, outboxDead, emailPending, emailDead, lockoutCount },
        recentUsers: recentUsers.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
        })),
        recentFailedOrders: recentFailedOrders.map((o) => ({
          id: o.id,
          customerEmail: o.customerEmail,
          amount: o.amount,
          currency: o.currency,
          createdAt: o.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
