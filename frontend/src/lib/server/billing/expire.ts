// Find PENDING SubscriptionTransaction rows whose expiresAt has passed and
// mark them EXPIRED in batches of `batchSize`. Mirrors orders/expire.ts's
// pattern. A checkout session the user never completes stays PENDING
// forever without this — and confirmed live 2026-08-24, so does a real
// declined payment SasPay never sends a webhook for (the reconciliation
// fallback in the webhook route only fires when SOME webhook arrives; an
// abandoned session with zero delivery attempts never triggers it).
// Idempotent: re-running on the same set finds zero PENDING + expired rows.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export interface ExpirePendingSubscriptionTransactionsOptions {
  prisma: PrismaClient;
  batchSize?: number; // default 100 — matches expirePendingOrders
}

export async function expirePendingSubscriptionTransactions(
  opts: ExpirePendingSubscriptionTransactionsOptions,
): Promise<{ expired: number }> {
  const batchSize = opts.batchSize ?? 100;

  const candidates = await opts.prisma.subscriptionTransaction.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    orderBy: { expiresAt: 'asc' },
    take: batchSize,
    select: { id: true },
  });

  if (candidates.length === 0) return { expired: 0 };

  let expired = 0;
  for (const t of candidates) {
    // Per-row tx — the status='PENDING' WHERE-guard prevents racing with a
    // webhook (direct match or reconciliation) that just flipped this row.
    const updated = await opts.prisma.$transaction(async (tx) => {
      const u = await tx.subscriptionTransaction.updateMany({
        where: { id: t.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      return u.count > 0;
    });
    if (updated) expired++;
  }
  return { expired };
}
