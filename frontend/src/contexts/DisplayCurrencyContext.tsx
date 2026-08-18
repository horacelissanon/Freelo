'use client';

// Global "devise d'affichage" switcher — same mechanism as ThemeContext
// (persisted choice, default-value-not-null-checked pattern) but purely a
// display transform: it never touches what's actually stored on a
// Project/Invoice/Devis. Picking a currency here just changes which number
// the StatCards show — see lib/displayAmount.ts for the conversion itself.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const DISPLAY_CURRENCIES = ['XOF', 'EUR', 'USD'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

interface DisplayCurrencyContextValue {
  displayCurrency: DisplayCurrency;
  cycleDisplayCurrency: () => void;
}

const STORAGE_KEY = 'merrudit-display-currency';

const DisplayCurrencyContext = createContext<DisplayCurrencyContextValue>({
  displayCurrency: 'XOF',
  cycleDisplayCurrency: () => {},
});

function isDisplayCurrency(value: string | null): value is DisplayCurrency {
  return value === 'XOF' || value === 'EUR' || value === 'USD';
}

export function DisplayCurrencyProvider({
  defaultCurrency,
  children,
}: {
  /** The freelance's account default currency (User.defaultCurrency) — used
   *  as the initial value only when nothing's been explicitly picked yet. */
  defaultCurrency: string;
  children: ReactNode;
}) {
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>('XOF');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage unavailable — falls through to the account default below.
    }
    if (isDisplayCurrency(stored)) {
      setDisplayCurrencyState(stored);
    } else if (isDisplayCurrency(defaultCurrency)) {
      setDisplayCurrencyState(defaultCurrency);
    }
  }, [defaultCurrency]);

  function cycleDisplayCurrency() {
    const idx = DISPLAY_CURRENCIES.indexOf(displayCurrency);
    const next = DISPLAY_CURRENCIES[(idx + 1) % DISPLAY_CURRENCIES.length] as DisplayCurrency;
    setDisplayCurrencyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Choice still applies for this session, just won't persist.
    }
  }

  return (
    <DisplayCurrencyContext.Provider value={{ displayCurrency, cycleDisplayCurrency }}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

export function useDisplayCurrency(): DisplayCurrencyContextValue {
  return useContext(DisplayCurrencyContext);
}
