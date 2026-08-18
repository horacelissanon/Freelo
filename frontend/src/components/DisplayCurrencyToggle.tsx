'use client';

// Small text button cycling XOF → EUR → USD, sharing DisplayCurrencyContext
// (localStorage key 'merrudit-display-currency') across every page — same
// placement pattern as ThemeToggle (Sidebar + mobile top bar), authenticated
// app only (no session/default currency on public pages).
import { useDisplayCurrency } from '@/contexts/DisplayCurrencyContext';

const LABEL: Record<string, string> = {
  XOF: 'Afficher les montants en XOF',
  EUR: 'Afficher les montants en EUR',
  USD: 'Afficher les montants en USD',
};

export function DisplayCurrencyToggle({ className = '' }: { className?: string }) {
  const { displayCurrency, cycleDisplayCurrency } = useDisplayCurrency();

  return (
    <button
      type="button"
      onClick={cycleDisplayCurrency}
      aria-label={`${LABEL[displayCurrency]} — cliquer pour changer`}
      title={LABEL[displayCurrency]}
      className={`flex h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-full px-2 font-body text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground ${className}`}
    >
      {displayCurrency}
    </button>
  );
}
