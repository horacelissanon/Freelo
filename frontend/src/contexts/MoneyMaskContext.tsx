'use client';

// Global "masquer les montants" switch — same mechanism as
// DisplayCurrencyContext/ThemeContext (persisted per-device preference, no
// server-side setting). Started as a Dashboard-local toggle embedded in the
// "Factures en attente" StatCard; promoted here so one control masks every
// money figure across the whole app (Dashboard, Projets, Clients,
// Devis/Factures, Statistiques) instead of just that one card.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface MoneyMaskContextValue {
  moneyMasked: boolean;
  toggleMoneyMasked: () => void;
}

const STORAGE_KEY = 'merrudit-money-masked';

const MoneyMaskContext = createContext<MoneyMaskContextValue>({
  moneyMasked: false,
  toggleMoneyMasked: () => {},
});

export function MoneyMaskProvider({ children }: { children: ReactNode }) {
  const [moneyMasked, setMoneyMasked] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setMoneyMasked(true);
    } catch {
      // Storage unavailable — stays visible for this session.
    }
  }, []);

  function toggleMoneyMasked() {
    setMoneyMasked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Preference still applies for this session, just won't persist.
      }
      return next;
    });
  }

  return (
    <MoneyMaskContext.Provider value={{ moneyMasked, toggleMoneyMasked }}>
      {children}
    </MoneyMaskContext.Provider>
  );
}

export function useMoneyMask(): MoneyMaskContextValue {
  return useContext(MoneyMaskContext);
}
