import { describe, it, expect, beforeEach, vi } from 'vitest';
import { expirePendingSubscriptionTransactions } from './expire';

describe('expirePendingSubscriptionTransactions', () => {
  let findMany: ReturnType<typeof vi.fn>;
  let updateMany: ReturnType<typeof vi.fn>;
  let $transaction: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    findMany = vi.fn();
    updateMany = vi.fn();
    $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ subscriptionTransaction: { updateMany } }),
    );
    prisma = { subscriptionTransaction: { findMany }, $transaction };
  });

  it('returns { expired: 0 } when no candidates', async () => {
    findMany.mockResolvedValueOnce([]);
    const r = await expirePendingSubscriptionTransactions({ prisma });
    expect(r).toEqual({ expired: 0 });
    expect($transaction).not.toHaveBeenCalled();
  });

  it('marks all candidates EXPIRED and returns the count', async () => {
    findMany.mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }]);
    updateMany.mockResolvedValue({ count: 1 });
    const r = await expirePendingSubscriptionTransactions({ prisma });
    expect(r).toEqual({ expired: 2 });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 't1', status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
  });

  it('uses default batchSize=100 in findMany.take', async () => {
    findMany.mockResolvedValueOnce([]);
    await expirePendingSubscriptionTransactions({ prisma });
    expect(findMany.mock.calls[0]![0]).toMatchObject({
      take: 100,
      orderBy: { expiresAt: 'asc' },
    });
  });

  it('honors custom batchSize', async () => {
    findMany.mockResolvedValueOnce([]);
    await expirePendingSubscriptionTransactions({ prisma, batchSize: 25 });
    expect(findMany.mock.calls[0]![0].take).toBe(25);
  });

  it('skips rows the WHERE-guard rejects (raced to PAID/FAILED by a webhook)', async () => {
    findMany.mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }]);
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const r = await expirePendingSubscriptionTransactions({ prisma });
    expect(r).toEqual({ expired: 1 });
  });

  it('queries with status=PENDING AND expiresAt < now()', async () => {
    findMany.mockResolvedValueOnce([]);
    await expirePendingSubscriptionTransactions({ prisma });
    const where = findMany.mock.calls[0]![0].where as { status: string; expiresAt: { lt: Date } };
    expect(where.status).toBe('PENDING');
    expect(where.expiresAt.lt).toBeInstanceOf(Date);
  });
});
