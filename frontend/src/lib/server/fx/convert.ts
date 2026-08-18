import 'server-only';

export interface ConvertibleRow {
  amount: number;
  currency: string;
  exchangeRateToDefault: number | null;
}

export interface ConvertedTotal {
  /** Stable total in the freelance's default currency, using each row's own
   *  frozen rate — never fluctuates with the daily live-rate cache. */
  amountDefault: number;
  /** Raw, unconverted totals per currency — for the "par devise" breakdown. */
  amountsByCurrency: Record<string, number>;
}

/**
 * Converts and sums a set of rows (Project/Invoice) into the freelance's
 * default currency, using each row's own frozen exchangeRateToDefault —
 * NOT the live daily rate, so historical totals stay stable day to day
 * (see lib/server/fx/rates.ts's cache for the live-rate side of this).
 *
 * `liveRates` is only consulted as a one-time bridge for rows created
 * before this system existed (currency !== default, exchangeRateToDefault
 * still null) — every new row always has a rate stored, so this fallback
 * only ever matters for pre-migration data.
 */
export function sumConverted(
  rows: ConvertibleRow[],
  defaultCurrency: string,
  liveRates: Record<string, number> | null,
): ConvertedTotal {
  let amountDefault = 0;
  const amountsByCurrency: Record<string, number> = {};

  for (const row of rows) {
    amountsByCurrency[row.currency] = (amountsByCurrency[row.currency] ?? 0) + row.amount;

    if (row.currency === defaultCurrency) {
      amountDefault += row.amount;
    } else if (row.exchangeRateToDefault != null) {
      amountDefault += row.amount * row.exchangeRateToDefault;
    } else if (liveRates) {
      // liveRates are "units of X per 1 EUR" — converting into
      // defaultCurrency is rate[defaultCurrency] / rate[row.currency].
      const from = liveRates[row.currency];
      const to = liveRates[defaultCurrency];
      if (from && to) amountDefault += row.amount * (to / from);
    }
  }

  return { amountDefault: Math.round(amountDefault), amountsByCurrency };
}
