/**
 * Periodic AdminAlert scan — covers signals that are conditions to detect
 * (lockout spikes, geo anomalies, coupon housekeeping, stale support
 * tickets) rather than events to react to inline. Run by the
 * `admin-alerts-scan` cron every 15 minutes (see app/api/cron/admin-alerts-scan).
 *
 * Inline (non-scan) alerts — circuit breaker open, webhook signature
 * invalid, OAuth rejection spikes, withdrawal PIN/guard abuse, large
 * refunds — are created directly at their call sites via createAdminAlert,
 * not here.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from '../redis';
import { createAdminAlert } from './index';
import { lockoutSpike, sessionGeoAnomaly, couponAttention, supportTicketStale } from './templates';

const LOCKOUT_HARD_CAP = 1000;
const LOCKOUT_WARNING_THRESHOLD = Number(process.env.ADMIN_ALERT_LOCKOUT_THRESHOLD ?? 10);
const LOCKOUT_CRITICAL_THRESHOLD = 50;
const HIGH_TICKET_SLA_HOURS = Number(process.env.ADMIN_ALERT_HIGH_TICKET_SLA_HOURS ?? 4);
const GEO_SCAN_WINDOW_MS = 15 * 60 * 1000; // matches the cron's own cadence
const GEO_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const COUPON_EXPIRING_WINDOW_MS = 48 * 60 * 60 * 1000;
const COUPON_QUOTA_NEAR_RATIO = 0.9;

async function countLockouts(redis: Redis): Promise<number> {
  let cursor = '0';
  let count = 0;
  do {
    const res = await redis.scan(cursor, { match: 'auth:lockout:*', count: 200 });
    cursor = String(res[0]);
    count += res[1].length;
  } while (cursor !== '0' && count < LOCKOUT_HARD_CAP);
  return count;
}

export interface AdminAlertsScanResult {
  lockoutAlertFired: boolean;
  geoAnomalies: number;
  couponAttentionFired: number;
  staleTickets: number;
}

export async function runAdminAlertsScan(
  prisma: PrismaClient,
  redis: Redis | null,
): Promise<AdminAlertsScanResult> {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const hourBucket = now.toISOString().slice(0, 13);

  // B4 — lockout spike.
  let lockoutAlertFired = false;
  if (redis) {
    const count = await countLockouts(redis);
    if (count >= LOCKOUT_WARNING_THRESHOLD) {
      const severity = count >= LOCKOUT_CRITICAL_THRESHOLD ? 'CRITICAL' : 'WARNING';
      const created = await createAdminAlert(prisma, lockoutSpike(count, severity, hourBucket));
      lockoutAlertFired = created !== null;
    }
  }

  // B5 — session geo anomaly: sessions created in this scan window vs. the
  // same user's most recent prior session in the last 30 days.
  const scanWindowStart = new Date(now.getTime() - GEO_SCAN_WINDOW_MS);
  const recentSessions = await prisma.session.findMany({
    where: { createdAt: { gte: scanWindowStart }, country: { not: null } },
    select: { id: true, userId: true, country: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  let geoAnomalies = 0;
  for (const session of recentSessions) {
    const prior = await prisma.session.findFirst({
      where: {
        userId: session.userId,
        id: { not: session.id },
        country: { not: null },
        createdAt: {
          lt: session.createdAt,
          gte: new Date(session.createdAt.getTime() - GEO_LOOKBACK_MS),
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { country: true },
    });
    if (prior?.country && session.country && prior.country !== session.country) {
      const created = await createAdminAlert(
        prisma,
        sessionGeoAnomaly(session.userId, session.id, prior.country, session.country),
      );
      if (created) geoAnomalies++;
    }
  }

  // B7 — coupon housekeeping: active coupons expired-but-active, expiring
  // soon, or near their redemption quota.
  const in48h = new Date(now.getTime() + COUPON_EXPIRING_WINDOW_MS);
  const activeCoupons = await prisma.coupon.findMany({
    where: { active: true },
    select: { id: true, code: true, expiresAt: true, maxRedemptions: true, redemptionCount: true },
  });
  let couponAttentionFired = 0;
  for (const coupon of activeCoupons) {
    let reason: 'EXPIRED_ACTIVE' | 'EXPIRING' | 'QUOTA_NEAR' | null = null;
    if (coupon.expiresAt && coupon.expiresAt < now) reason = 'EXPIRED_ACTIVE';
    else if (coupon.expiresAt && coupon.expiresAt <= in48h) reason = 'EXPIRING';
    else if (
      coupon.maxRedemptions &&
      coupon.redemptionCount >= COUPON_QUOTA_NEAR_RATIO * coupon.maxRedemptions
    ) {
      reason = 'QUOTA_NEAR';
    }
    if (!reason) continue;
    const created = await createAdminAlert(
      prisma,
      couponAttention(
        coupon.id,
        coupon.code,
        reason,
        reason === 'EXPIRED_ACTIVE' ? todayKey : undefined,
      ),
    );
    if (created) couponAttentionFired++;
  }

  // B8 — HIGH priority support tickets stuck OPEN past the SLA.
  const slaBoundary = new Date(now.getTime() - HIGH_TICKET_SLA_HOURS * 60 * 60 * 1000);
  const staleTicketRows = await prisma.supportTicket.findMany({
    where: { priority: 'HIGH', status: 'OPEN', createdAt: { lt: slaBoundary } },
    select: { id: true, subject: true, createdAt: true },
  });
  let staleTickets = 0;
  for (const ticket of staleTicketRows) {
    const ageHours = Math.floor((now.getTime() - ticket.createdAt.getTime()) / 3_600_000);
    const created = await createAdminAlert(
      prisma,
      supportTicketStale(ticket.id, ticket.subject, ageHours, todayKey),
    );
    if (created) staleTickets++;
  }

  return { lockoutAlertFired, geoAnomalies, couponAttentionFired, staleTickets };
}
