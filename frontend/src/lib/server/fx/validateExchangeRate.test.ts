import { describe, it, expect, vi } from 'vitest';
import { getDefaultCurrency, exchangeRateValidationError } from './validateExchangeRate';

describe('getDefaultCurrency', () => {
  it('returns the user default currency', async () => {
    const findUnique = vi.fn().mockResolvedValue({ defaultCurrency: 'EUR' });
    const prisma = { user: { findUnique } } as never;
    await expect(getDefaultCurrency(prisma, 'u-1')).resolves.toBe('EUR');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      select: { defaultCurrency: true },
    });
  });

  it('falls back to XOF when the user row is missing', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findUnique } } as never;
    await expect(getDefaultCurrency(prisma, 'u-1')).resolves.toBe('XOF');
  });
});

describe('exchangeRateValidationError', () => {
  it('returns null when currency matches the default (no rate needed)', () => {
    expect(exchangeRateValidationError('XOF', 'XOF', null, 'req-1')).toBeNull();
  });

  it('returns null when currency differs and a positive rate is supplied', () => {
    expect(exchangeRateValidationError('EUR', 'XOF', 655.957, 'req-1')).toBeNull();
  });

  it('returns a 400 VALIDATION_FAILED when currency differs and the rate is missing', async () => {
    const res = exchangeRateValidationError('EUR', 'XOF', null, 'req-1');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    expect((await res!.json()).error).toBe('VALIDATION_FAILED');
  });

  it('returns a 400 when currency differs and the rate is zero or negative', () => {
    expect(exchangeRateValidationError('EUR', 'XOF', 0, 'req-1')).not.toBeNull();
    expect(exchangeRateValidationError('EUR', 'XOF', -5, 'req-1')).not.toBeNull();
  });
});
