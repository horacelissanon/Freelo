// Pure resolver for FacturationTab's post-checkout success screen. After a
// FedaPay redirect back to /settings?tab=abonnement, the tab looks up the
// transaction id it stashed in sessionStorage before leaving for checkout
// (see FacturationTab.tsx) inside the freshly-fetched transactions list and
// decides whether to show the success modal, a failure toast, or keep
// polling (webhook confirmation is async, see CLAUDE.md's outbox/webhook
// notes).
import { describe, it, expect } from 'vitest';
import { resolvePendingTransaction, type TransactionLike } from './billingSuccess';

const transactions: TransactionLike[] = [
  { id: 'tx_paid', status: 'PAID' },
  { id: 'tx_failed', status: 'FAILED' },
  { id: 'tx_pending', status: 'PENDING' },
];

describe('resolvePendingTransaction', () => {
  it('returns PAID for a matching paid transaction', () => {
    expect(resolvePendingTransaction(transactions, 'tx_paid')).toBe('PAID');
  });

  it('returns FAILED for a matching failed transaction', () => {
    expect(resolvePendingTransaction(transactions, 'tx_failed')).toBe('FAILED');
  });

  it('returns PENDING for a matching still-pending transaction', () => {
    expect(resolvePendingTransaction(transactions, 'tx_pending')).toBe('PENDING');
  });

  it('returns NOT_FOUND when the id is not in the list yet', () => {
    expect(resolvePendingTransaction(transactions, 'tx_unknown')).toBe('NOT_FOUND');
  });
});
