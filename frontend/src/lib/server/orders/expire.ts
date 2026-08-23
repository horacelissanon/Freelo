// frontend/src/lib/server/orders/expire.ts — Phase 5 D-14.
//
// Find PENDING Order rows whose expiresAt has passed and mark them EXPIRED
// in batches of `batchSize`. Idempotent: re-running on the same set finds
// zero PENDING + expired rows (they're already EXPIRED).
//
// Emits an in-app `orderExpired` notification per row once its own per-row
// tx commits — best-effort (wrapped in try/catch), never blocks the batch:
// the Order is already committed EXPIRED regardless of notification outcome.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createNotification } from '../notifications';
import { orderExpired } from '../notifications/templates';

export interface ExpirePendingOrdersOptions {
  prisma: PrismaClient;
  batchSize?: number; // default 100 — D-08
}

export async function expirePendingOrders(
  opts: ExpirePendingOrdersOptions,
): Promise<{ expired: number }> {
  const batchSize = opts.batchSize ?? 100;

  const candidates = await opts.prisma.order.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    orderBy: { expiresAt: 'asc' },
    take: batchSize,
    select: { id: true, userId: true, amount: true, currency: true },
  });

  if (candidates.length === 0) return { expired: 0 };

  let expired = 0;
  for (const o of candidates) {
    // Per-row tx — atomic update. The status='PENDING' WHERE-guard prevents
    // racing with a webhook that just flipped this row to PAID.
    const updated = await opts.prisma.$transaction(async (tx) => {
      const u = await tx.order.updateMany({
        where: { id: o.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      return u.count > 0;
    });
    if (updated) {
      expired++;
      if (o.userId) {
        try {
          await createNotification(opts.prisma, orderExpired(o.userId, o.id));
        } catch {
          // Best-effort — the order is already committed EXPIRED.
        }
      }
    }
  }
  return { expired };
}
