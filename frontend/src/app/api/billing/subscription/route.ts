// GET /api/billing/subscription — current plan/status/usage for the
// Paramètres → Abonnement tab. Lazily creates a FREE Subscription row on
// first read (mirrors NotificationPreferences' upsert-on-read pattern).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  getOrCreateSubscription,
  isProActive,
  FREE_PLAN_LIMITS,
} from '@/lib/server/billing/subscription';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const subscription = await getOrCreateSubscription(prisma, auth.user.sub);

    const [clientCount, activeProjectCount] = await Promise.all([
      prisma.client.count({ where: { userId: auth.user.sub } }),
      prisma.project.count({ where: { userId: auth.user.sub, status: 'IN_PROGRESS' } }),
    ]);

    const transactions = await prisma.subscriptionTransaction.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        amount: true,
        currency: true,
        billingCycle: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          isProActive: isProActive(subscription),
        },
        usage: {
          clients: clientCount,
          activeProjects: activeProjectCount,
          limits: FREE_PLAN_LIMITS,
        },
        transactions,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
