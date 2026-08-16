import { describe, it, expect, vi } from 'vitest';
import { computeDepositBalance } from './depositBalance';

function makeDb(orders: { amount: number; metadata: unknown }[]) {
  return { order: { findMany: vi.fn().mockResolvedValue(orders) } };
}

const project = { id: 'p-1', amount: 100000, depositPercent: 30 };

describe('computeDepositBalance', () => {
  it('no paid orders -> theoretical depositPercent split, nothing marked paid', async () => {
    const db = makeDb([]);
    const result = await computeDepositBalance(db as never, project);
    expect(result.deposit).toEqual({ amount: 30000, paid: false });
    expect(result.balance).toEqual({ amount: 70000, paid: false });
  });

  it('deposit paid at exactly the theoretical amount', async () => {
    const db = makeDb([{ amount: 30000, metadata: { projectId: 'p-1', docType: 'DEPOSIT' } }]);
    const result = await computeDepositBalance(db as never, project);
    expect(result.deposit).toEqual({ amount: 30000, paid: true });
    expect(result.balance).toEqual({ amount: 70000, paid: false });
  });

  it('partial deposit paid -> shows the real amount, balance recomputed from it', async () => {
    const db = makeDb([{ amount: 15000, metadata: { projectId: 'p-1', docType: 'DEPOSIT' } }]);
    const result = await computeDepositBalance(db as never, project);
    expect(result.deposit).toEqual({ amount: 15000, paid: true });
    expect(result.balance).toEqual({ amount: 85000, paid: false });
  });

  it('deposit and balance both paid -> both real amounts reflected', async () => {
    const db = makeDb([
      { amount: 15000, metadata: { projectId: 'p-1', docType: 'DEPOSIT' } },
      { amount: 85000, metadata: { projectId: 'p-1', docType: 'BALANCE' } },
    ]);
    const result = await computeDepositBalance(db as never, project);
    expect(result.deposit).toEqual({ amount: 15000, paid: true });
    expect(result.balance).toEqual({ amount: 85000, paid: true });
  });

  it('deposit paid above the project total -> balance clamps to 0, never negative', async () => {
    const db = makeDb([{ amount: 150000, metadata: { projectId: 'p-1', docType: 'DEPOSIT' } }]);
    const result = await computeDepositBalance(db as never, project);
    expect(result.deposit).toEqual({ amount: 150000, paid: true });
    expect(result.balance).toEqual({ amount: 0, paid: false });
  });

  it('ignores orders with no recognized docType (e.g. a subscription/other charge)', async () => {
    const db = makeDb([
      { amount: 5000, metadata: { projectId: 'p-1', docType: 'REFUND' } },
      { amount: 5000, metadata: null },
    ]);
    const result = await computeDepositBalance(db as never, project);
    expect(result.deposit).toEqual({ amount: 30000, paid: false });
    expect(result.balance).toEqual({ amount: 70000, paid: false });
  });

  it('queries orders scoped to this project via metadata.projectId, status PAID only', async () => {
    const db = makeDb([]);
    await computeDepositBalance(db as never, project);
    const args = db.order.findMany.mock.calls[0]?.[0];
    expect(args?.where?.status).toBe('PAID');
    expect(args?.where?.metadata).toEqual({ path: ['projectId'], equals: 'p-1' });
  });
});
