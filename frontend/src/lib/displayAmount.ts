// Shared (client + server-agnostic) pure math for the global "devise
// d'affichage" switcher. Deliberately NOT under lib/server/ — same reason
// as currencyConvert.ts: consumed directly by 'use client' pages.
import { sumConverted, type ConvertibleRow } from './currencyConvert';
//
// Two distinct paths, matching the stability requirement decided with the
// freelance: when the picked display currency IS the account's own default,
// this returns the stable amountDefault already computed server-side from
// each document's own frozen exchangeRateToDefault (never fluctuates day to
// day). Only when the freelance deliberately previews a DIFFERENT currency
// does this fall through to a live, on-the-fly conversion from the raw
// amountsByCurrency breakdown — expected to vary with the daily rate, since
// that's an explicit "what would this look like in X" preview, not the
// freelance's real bookkeeping currency.
export interface DisplayAmountInput {
  amountDefault: number;
  amountsByCurrency: Record<string, number>;
  displayCurrency: string;
  defaultCurrency: string;
  liveRates: Record<string, number> | null;
}

export function displayAmount({
  amountDefault,
  amountsByCurrency,
  displayCurrency,
  defaultCurrency,
  liveRates,
}: DisplayAmountInput): number {
  if (displayCurrency === defaultCurrency) return amountDefault;
  // No live rate yet (fetch still in flight) — show the stable default
  // rather than block or flash a wrong number.
  if (!liveRates) return amountDefault;

  let total = 0;
  for (const [currency, amount] of Object.entries(amountsByCurrency)) {
    // liveRates are "units of X per 1 EUR" — converting straight from the
    // row's own currency into displayCurrency is rate[displayCurrency] /
    // rate[currency], same cross-rate formula as sumConverted().
    const from = liveRates[currency];
    const to = liveRates[displayCurrency];
    if (from && to) total += amount * (to / from);
  }
  return Math.round(total);
}

/**
 * Convenience combo of sumConverted + displayAmount for client-side row
 * lists (invoices/projects pages) that don't have a pre-computed
 * amountDefault/amountsByCurrency pair from the API — sums the rows into
 * the account's defaultCurrency first (frozen per-row rates, stable), then
 * applies the same live-conversion display transform as displayAmount().
 */
export function sumForDisplay(
  rows: ConvertibleRow[],
  defaultCurrency: string,
  displayCurrency: string,
  liveRates: Record<string, number> | null,
): number {
  const { amountDefault, amountsByCurrency } = sumConverted(rows, defaultCurrency, liveRates);
  return displayAmount({
    amountDefault,
    amountsByCurrency,
    displayCurrency,
    defaultCurrency,
    liveRates,
  });
}
