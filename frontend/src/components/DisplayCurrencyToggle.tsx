'use client';

// Pill button cycling XOF → EUR → USD, sharing DisplayCurrencyContext
// (localStorage key 'merrudit-display-currency') across every page — same
// placement pattern as ThemeToggle (Sidebar + mobile top bar), authenticated
// app only (no session/default currency on public pages). Styled as a
// bordered pill with a chevron (not bare text like ThemeToggle's plain
// icon-circle) so it reads as an interactive selector rather than a label.
import { Icon } from '@/components/ui/Icon';
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
      className={`flex h-8 flex-shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-secondary/40 px-2.5 font-body text-[11px] font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground ${className}`}
    >
      {displayCurrency}
      <Icon i="chevron-down" size={12} className="opacity-70" />
    </button>
  );
}
