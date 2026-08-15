// Pure math, no mocking needed — this is the single source of truth both
// the API (Invoice.amount) and the frontend (live preview, floating total
// bar) rely on to stay in sync.
import { describe, it, expect } from 'vitest';
import { computeItemsTotal, computeQuoteTotal, computeBalance } from './invoiceTotals';

describe('computeItemsTotal', () => {
  it('empty list is zero', () => {
    expect(computeItemsTotal([])).toBe(0);
  });

  it('single item multiplies quantity by unitPrice', () => {
    expect(computeItemsTotal([{ quantity: 3, unitPrice: 1500 }])).toBe(4500);
  });

  it('sums multiple items with different quantity/price combos', () => {
    expect(
      computeItemsTotal([
        { quantity: 1, unitPrice: 100000 },
        { quantity: 2, unitPrice: 25000 },
        { quantity: 5, unitPrice: 1000 },
      ]),
    ).toBe(155000);
  });
});

describe('computeQuoteTotal', () => {
  it('empty pack list is zero', () => {
    expect(computeQuoteTotal([])).toBe(0);
  });

  it('sums across multiple packs with different item counts', () => {
    const total = computeQuoteTotal([
      { items: [{ quantity: 1, unitPrice: 500000 }] },
      {
        items: [
          { quantity: 2, unitPrice: 50000 },
          { quantity: 1, unitPrice: 200000 },
        ],
      },
    ]);
    expect(total).toBe(500000 + 100000 + 200000);
  });

  it('a pack with no items contributes zero', () => {
    expect(computeQuoteTotal([{ items: [] }, { items: [{ quantity: 1, unitPrice: 10000 }] }])).toBe(
      10000,
    );
  });
});

describe('computeBalance', () => {
  it('subtracts deposit from the total', () => {
    expect(computeBalance(100000, 30000)).toBe(70000);
  });

  it('null deposit leaves the full amount as balance', () => {
    expect(computeBalance(100000, null)).toBe(100000);
  });

  it('undefined deposit leaves the full amount as balance', () => {
    expect(computeBalance(100000, undefined)).toBe(100000);
  });

  it('does not clamp — a deposit greater than the amount yields a negative balance', () => {
    expect(computeBalance(50000, 80000)).toBe(-30000);
  });
});
