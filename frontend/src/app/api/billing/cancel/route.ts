// POST /api/billing/cancel — stop auto-renewal reminders; stays Pro until
// `currentPeriodEnd` (no refund logic since SasPay never auto-charges —
// every period was its own explicit, already-completed transaction).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getOrCreateSubscription } from '@/lib/server/billing/subscription';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
    if (subscription.plan !== 'PRO') {
      return NextResponse.json(
        { error: 'NOT_ON_PRO', message: 'Aucun abonnement Pro actif à annuler.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    return NextResponse.json(
      {
        subscription: {
          cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
          currentPeriodEnd: updated.currentPeriodEnd,
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
