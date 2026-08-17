// Daily cron — reminds Pro subscriptions expiring within 3 days (in-app +
// email if configured), and flips already-expired ones to EXPIRED/FREE so
// the UI is unambiguous (isProActive() already treats a past
// currentPeriodEnd as inactive regardless — this is a clarity step, not a
// gating prerequisite).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createNotification } from '@/lib/server/notifications/index';
import {
  subscriptionExpired,
  subscriptionExpiringSoon,
} from '@/lib/server/notifications/templates';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;
const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let reminded = 0;
    let expired = 0;

    await withLease(redis ?? undefined, 'subscription-expiry', LEASE_TTL_MS, async () => {
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      const reminderCutoff = new Date(now.getTime() + REMINDER_WINDOW_MS);

      const expiringSoon = await prisma.subscription.findMany({
        where: {
          plan: 'PRO',
          status: 'ACTIVE',
          cancelAtPeriodEnd: false,
          currentPeriodEnd: { gt: now, lte: reminderCutoff },
        },
        select: {
          id: true,
          userId: true,
          currentPeriodEnd: true,
          user: { select: { email: true } },
        },
      });
      for (const sub of expiringSoon) {
        if (!sub.currentPeriodEnd) continue;
        const periodEndIso = sub.currentPeriodEnd.toISOString();
        const created = await createNotification(
          prisma,
          subscriptionExpiringSoon(sub.userId, sub.id, periodEndIso, todayKey),
        );
        if (created) {
          reminded++;
          const queue = getEmailQueue();
          if (queue) {
            await queue.enqueue({
              to: sub.user.email,
              subject: 'Ton abonnement Merrudit Pro expire bientôt',
              html: `<p>Ton abonnement Pro expire le ${sub.currentPeriodEnd.toLocaleDateString('fr-FR')}. Renouvelle depuis Paramètres → Abonnement pour garder tes fonctionnalités Pro.</p>`,
            });
          }
        }
      }

      // Per-row (not bulk) so the freelance actually learns their Pro plan
      // lapsed — this is the "payment overdue" terminal event for a
      // subscription that reminders above didn't manage to get renewed.
      const lapsing = await prisma.subscription.findMany({
        where: { plan: 'PRO', currentPeriodEnd: { lt: now } },
        select: {
          id: true,
          userId: true,
          currentPeriodEnd: true,
          user: { select: { email: true } },
        },
      });
      for (const sub of lapsing) {
        if (!sub.currentPeriodEnd) continue;
        const updated = await prisma.subscription.updateMany({
          where: { id: sub.id, plan: 'PRO', currentPeriodEnd: { lt: now } },
          data: { plan: 'FREE', status: 'EXPIRED', cancelAtPeriodEnd: false },
        });
        if (updated.count === 0) continue;
        expired++;
        const created = await createNotification(
          prisma,
          subscriptionExpired(sub.userId, sub.id, sub.currentPeriodEnd.toISOString()),
        );
        if (created) {
          const queue = getEmailQueue();
          if (queue) {
            await queue.enqueue({
              to: sub.user.email,
              subject: 'Ton abonnement Merrudit Pro a expiré',
              html: "<p>Le paiement n'a pas été reçu à temps et ton compte est repassé en plan Gratuit. Réabonne-toi depuis Paramètres → Abonnement pour retrouver tes fonctionnalités Pro.</p>",
            });
          }
        }
      }

      log.info('subscription-expiry tick', { reminded, expired, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, reminded, expired },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
