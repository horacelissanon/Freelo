// Shared acompte/solde derivation — extracted from GET /api/projects/[id]
// and GET /api/track/[token] (which had it duplicated verbatim, plus a third
// theoretical-only copy in track/[token]/pay/route.ts) so all three agree by
// construction instead of by comment-promise. Reads the actual PAID Order
// amount for each bucket (DEPOSIT/BALANCE) when one was recorded — a manually
// entered partial acompte (e.g. via the devis->projet flow) is reflected
// exactly, not silently overwritten by the theoretical depositPercent split.
import 'server-only';
import type { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'order'>;

interface PaidOrderMeta {
  projectId?: string;
  docType?: 'DEPOSIT' | 'BALANCE';
}

export interface DepositBalance {
  deposit: { amount: number; paid: boolean };
  balance: { amount: number; paid: boolean };
}

export async function computeDepositBalance(
  db: Db,
  project: { id: string; amount: number; depositPercent: number },
): Promise<DepositBalance> {
  const paidOrders = await db.order.findMany({
    where: { status: 'PAID', metadata: { path: ['projectId'], equals: project.id } },
    select: { amount: true, metadata: true },
  });
  const paidByKind = new Map<'DEPOSIT' | 'BALANCE', number>();
  for (const o of paidOrders) {
    const kind = (o.metadata as PaidOrderMeta | null)?.docType;
    if (kind === 'DEPOSIT' || kind === 'BALANCE') {
      paidByKind.set(kind, (paidByKind.get(kind) ?? 0) + o.amount);
    }
  }
  const theoreticalDeposit = Math.round((project.amount * project.depositPercent) / 100);
  const depositAmount = paidByKind.get('DEPOSIT') ?? theoreticalDeposit;
  const balanceAmount = paidByKind.get('BALANCE') ?? Math.max(0, project.amount - depositAmount);
  return {
    deposit: { amount: depositAmount, paid: paidByKind.has('DEPOSIT') },
    balance: { amount: balanceAmount, paid: paidByKind.has('BALANCE') },
  };
}
