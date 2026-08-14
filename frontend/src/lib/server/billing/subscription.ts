// Merrudit SaaS subscription — the freelancer paying to use the app itself,
// distinct from Order (an end CLIENT paying the freelancer). No row means
// implicit FREE plan; getOrCreateSubscription lazily creates one on first
// read, mirroring the NotificationPreferences upsert-on-read pattern.
import 'server-only';
import type { PrismaClient, Subscription } from '@prisma/client';

export const FREE_PLAN_LIMITS = {
  maxClients: 1,
  maxActiveProjects: 2,
} as const;

export const PRO_PRICING = {
  MONTHLY: { amount: 3500, currency: 'XOF' },
  YEARLY: { amount: 35000, currency: 'XOF' },
} as const;

export type BillingCycle = keyof typeof PRO_PRICING;

export async function getOrCreateSubscription(
  prisma: PrismaClient,
  userId: string,
): Promise<Subscription> {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.subscription.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/**
 * Single source of truth for "does this user currently get Pro features".
 * A Pro subscription past its `currentPeriodEnd` with no renewal is treated
 * as inactive here even before the expiry cron flips `status`/`plan` —
 * the cron exists for UI clarity, not as a prerequisite for correct gating.
 */
export function isProActive(
  sub: Pick<Subscription, 'plan' | 'status' | 'currentPeriodEnd'>,
): boolean {
  if (sub.plan !== 'PRO' || sub.status !== 'ACTIVE') return false;
  if (!sub.currentPeriodEnd) return true;
  return sub.currentPeriodEnd.getTime() > Date.now();
}

function addCycle(from: Date, cycle: BillingCycle): Date {
  const next = new Date(from);
  if (cycle === 'MONTHLY') next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

/** Next period end computed from `now`, or from the current period end if renewing early (no lost time). */
export function computeNextPeriodEnd(cycle: BillingCycle, currentPeriodEnd: Date | null): Date {
  const base =
    currentPeriodEnd && currentPeriodEnd.getTime() > Date.now() ? currentPeriodEnd : new Date();
  return addCycle(base, cycle);
}
