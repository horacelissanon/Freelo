import { describe, it, expect } from 'vitest';
import { sumConverted } from './currencyConvert';

describe('sumConverted', () => {
  it('sums same-currency rows at face value', () => {
    const result = sumConverted(
      [
        { amount: 1000, currency: 'XOF', exchangeRateToDefault: null },
        { amount: 2000, currency: 'XOF', exchangeRateToDefault: null },
      ],
      'XOF',
      null,
    );
    expect(result.amountDefault).toBe(3000);
    expect(result.amountsByCurrency).toEqual({ XOF: 3000 });
  });

  it('converts a non-default row using its own frozen rate', () => {
    const result = sumConverted(
      [
        { amount: 1000, currency: 'XOF', exchangeRateToDefault: null },
        { amount: 100, currency: 'EUR', exchangeRateToDefault: 655.957 },
      ],
      'XOF',
      null,
    );
    expect(result.amountDefault).toBe(1000 + Math.round(100 * 655.957));
    expect(result.amountsByCurrency).toEqual({ XOF: 1000, EUR: 100 });
  });

  it('ignores the live rate cache when a frozen rate is present (stability)', () => {
    const result = sumConverted(
      [{ amount: 100, currency: 'EUR', exchangeRateToDefault: 600 }],
      'XOF',
      { XOF: 655.957, EUR: 1, USD: 1.16 },
    );
    // Uses the frozen 600, not a live-derived cross rate.
    expect(result.amountDefault).toBe(60000);
  });

  it('falls back to the live rate only for legacy rows with no frozen rate', () => {
    const result = sumConverted(
      [{ amount: 100, currency: 'EUR', exchangeRateToDefault: null }],
      'XOF',
      { XOF: 655.957, EUR: 1, USD: 1.16 },
    );
    // 100 EUR -> XOF: 100 * (rate[XOF] / rate[EUR]) = 100 * 655.957
    expect(result.amountDefault).toBe(Math.round(100 * 655.957));
  });

  it('cross-converts correctly between two non-EUR currencies via the EUR base', () => {
    const result = sumConverted(
      [{ amount: 100, currency: 'USD', exchangeRateToDefault: null }],
      'XOF',
      { XOF: 655.957, EUR: 1, USD: 1.16 },
    );
    // 100 USD -> XOF: 100 * (655.957 / 1.16)
    expect(result.amountDefault).toBe(Math.round(100 * (655.957 / 1.16)));
  });

  it('excludes a legacy row with no frozen rate and no live rates available', () => {
    const result = sumConverted(
      [
        { amount: 1000, currency: 'XOF', exchangeRateToDefault: null },
        { amount: 100, currency: 'EUR', exchangeRateToDefault: null },
      ],
      'XOF',
      null,
    );
    expect(result.amountDefault).toBe(1000);
    expect(result.amountsByCurrency).toEqual({ XOF: 1000, EUR: 100 });
  });
});
