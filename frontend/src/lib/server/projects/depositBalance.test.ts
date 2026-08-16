import { describe, it, expect, vi } from 'vitest';
import { computeDepositBalance, computeDepositBalanceBatch } from './depositBalance';

function makeDb(
  orders: { amount: number; metadata: unknown }[],
  paidInvoice: { id: string } | null = null,
) {
  return {
    order: { findMany: vi.fn().mockResolvedValue(orders) },
    invoice: { findFirst: vi.fn().mockResolvedValue(paidInvoice) },
  };
}

function makeBatchDb(
  orders: { amount: number; metadata: unknown }[],
  paidInvoices: { projectId: string }[] = [],
) {
  return {
    order: { findMany: vi.fn().mockResolvedValue(orders) },
    invoice: { findMany: vi.fn().mockResolvedValue(paidInvoices) },
  };
}

const project = { id: 'p-1', amount: 100000, depositType: 'PERCENT', depositValue: 30 };

describe('computeDepositBalance', () => {
  it('no paid orders -> theoretical PERCENT split, nothing marked paid', async () => {
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

  it('a paid linked facture settles deposit and balance even with no Order at all', async () => {
    const db = makeDb([], { id: 'inv-1' });
    const result = await computeDepositBalance(db as never, project);
    expect(result.deposit).toEqual({ amount: 30000, paid: true });
    expect(result.balance).toEqual({ amount: 70000, paid: true });
  });

  it('a paid linked facture settles both buckets while preserving a real partial acompte amount', async () => {
    const db = makeDb([{ amount: 15000, metadata: { projectId: 'p-1', docType: 'DEPOSIT' } }], {
      id: 'inv-1',
    });
    const result = await computeDepositBalance(db as never, project);
    expect(result.deposit).toEqual({ amount: 15000, paid: true });
    expect(result.balance).toEqual({ amount: 85000, paid: true });
  });

  it('queries the facture scoped to this project, docType INVOICE, status PAID only', async () => {
    const db = makeDb([]);
    await computeDepositBalance(db as never, project);
    const args = db.invoice.findFirst.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ projectId: 'p-1', docType: 'INVOICE', status: 'PAID' });
  });

  it('no paid facture found -> no effect on the theoretical/Order-derived result', async () => {
    const db = makeDb([], null);
    const result = await computeDepositBalance(db as never, project);
    expect(result.deposit).toEqual({ amount: 30000, paid: false });
    expect(result.balance).toEqual({ amount: 70000, paid: false });
  });

  it('depositType FIXED -> theoretical deposit is the raw depositValue, not a percentage', async () => {
    const fixedProject = { id: 'p-1', amount: 100000, depositType: 'FIXED', depositValue: 20000 };
    const db = makeDb([]);
    const result = await computeDepositBalance(db as never, fixedProject);
    expect(result.deposit).toEqual({ amount: 20000, paid: false });
    expect(result.balance).toEqual({ amount: 80000, paid: false });
  });

  it('depositType NONE -> deposit bucket is trivially satisfied (0, paid), everything due as balance', async () => {
    const noneProject = { id: 'p-1', amount: 100000, depositType: 'NONE', depositValue: 50 };
    const db = makeDb([]);
    const result = await computeDepositBalance(db as never, noneProject);
    expect(result.deposit).toEqual({ amount: 0, paid: true });
    expect(result.balance).toEqual({ amount: 100000, paid: false });
  });
});

describe('computeDepositBalanceBatch', () => {
  const projectA = { id: 'p-a', amount: 100000, depositType: 'PERCENT', depositValue: 30 };
  const projectB = { id: 'p-b', amount: 50000, depositType: 'PERCENT', depositValue: 50 };

  it('empty list -> empty map, no queries made', async () => {
    const db = makeBatchDb([]);
    const result = await computeDepositBalanceBatch(db as never, []);
    expect(result.size).toBe(0);
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  it('single project, no paid orders -> matches the single-project theoretical result', async () => {
    const db = makeBatchDb([]);
    const result = await computeDepositBalanceBatch(db as never, [projectA]);
    expect(result.get('p-a')).toEqual({
      deposit: { amount: 30000, paid: false },
      balance: { amount: 70000, paid: false },
    });
  });

  it('groups orders by project, one query for the whole batch', async () => {
    const db = makeBatchDb([
      { amount: 30000, metadata: { projectId: 'p-a', docType: 'DEPOSIT' } },
      { amount: 25000, metadata: { projectId: 'p-b', docType: 'DEPOSIT' } },
    ]);
    const result = await computeDepositBalanceBatch(db as never, [projectA, projectB]);
    expect(result.get('p-a')).toEqual({
      deposit: { amount: 30000, paid: true },
      balance: { amount: 70000, paid: false },
    });
    expect(result.get('p-b')).toEqual({
      deposit: { amount: 25000, paid: true },
      balance: { amount: 25000, paid: false },
    });
    expect(db.order.findMany).toHaveBeenCalledTimes(1);
    const args = db.order.findMany.mock.calls[0]?.[0];
    expect(args?.where?.status).toBe('PAID');
    expect(args?.where?.OR).toEqual([
      { metadata: { path: ['projectId'], equals: 'p-a' } },
      { metadata: { path: ['projectId'], equals: 'p-b' } },
    ]);
  });

  it('a paid linked facture settles both buckets for that project only', async () => {
    const db = makeBatchDb([], [{ projectId: 'p-a' }]);
    const result = await computeDepositBalanceBatch(db as never, [projectA, projectB]);
    expect(result.get('p-a')).toEqual({
      deposit: { amount: 30000, paid: true },
      balance: { amount: 70000, paid: true },
    });
    expect(result.get('p-b')).toEqual({
      deposit: { amount: 25000, paid: false },
      balance: { amount: 25000, paid: false },
    });
    expect(db.invoice.findMany).toHaveBeenCalledTimes(1);
    const args = db.invoice.findMany.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      projectId: { in: ['p-a', 'p-b'] },
      docType: 'INVOICE',
      status: 'PAID',
    });
  });

  it('an order with no recognized projectId in its metadata is ignored', async () => {
    const db = makeBatchDb([{ amount: 30000, metadata: { docType: 'DEPOSIT' } }]);
    const result = await computeDepositBalanceBatch(db as never, [projectA]);
    expect(result.get('p-a')).toEqual({
      deposit: { amount: 30000, paid: false },
      balance: { amount: 70000, paid: false },
    });
  });
});
