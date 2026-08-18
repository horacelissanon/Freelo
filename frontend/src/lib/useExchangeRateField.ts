'use client';

// Shared behaviour for the "1 [currency] = X [defaultCurrency]" field that
// appears in ProjectForm/InvoiceForm/QuoteBuilderForm whenever the picked
// currency differs from the freelance's account default. Auto-suggests the
// live cached rate (GET /api/fx-rates) but never clobbers a value the
// freelance has actually typed — `reset()` is called from the currency
// picker's onClick so switching currencies re-suggests a fresh value.
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/useApi';

interface FxRates {
  XOF: number;
  EUR: number;
  USD: number;
}

export function useExchangeRateField(
  currency: string,
  defaultCurrency: string,
  initialRate?: number | null,
) {
  const { data: fx } = useApi<FxRates>('/api/fx-rates');
  const [rate, setRate] = useState(initialRate != null ? String(initialRate) : '');
  const [touched, setTouched] = useState(false);
  const needsRate = currency !== defaultCurrency;

  useEffect(() => {
    if (!needsRate || touched || !fx) return;
    const from = fx[currency as keyof FxRates];
    const to = fx[defaultCurrency as keyof FxRates];
    if (from && to) setRate(String(Number((from / to).toFixed(6))));
  }, [currency, defaultCurrency, needsRate, touched, fx]);

  return {
    needsRate,
    rate,
    onChange: (value: string) => {
      setRate(value);
      setTouched(true);
    },
    reset: () => setTouched(false),
  };
}
