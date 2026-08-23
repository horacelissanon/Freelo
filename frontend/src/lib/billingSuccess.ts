// See billingSuccess.test.ts for the "why" — this resolver is what turns
// the polled /api/billing/subscription transactions list into a decision
// for FacturationTab's post-checkout UI.
export type PendingTxStatus = 'PAID' | 'FAILED' | 'PENDING' | 'NOT_FOUND';

export interface TransactionLike {
  id: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
}

export function resolvePendingTransaction(
  transactions: TransactionLike[],
  pendingId: string,
): PendingTxStatus {
  const match = transactions.find((t) => t.id === pendingId);
  return match ? match.status : 'NOT_FOUND';
}
