'use client';

// Small icon button toggling the global money mask, sharing MoneyMaskContext
// across every page — same placement pattern as ThemeToggle, sitting right
// next to DisplayCurrencyToggle (Sidebar + mobile top bar).
import { Icon } from '@/components/ui/Icon';
import { useMoneyMask } from '@/contexts/MoneyMaskContext';

export function MoneyMaskToggle({ className = '' }: { className?: string }) {
  const { moneyMasked, toggleMoneyMasked } = useMoneyMask();

  return (
    <button
      type="button"
      onClick={toggleMoneyMasked}
      aria-label={moneyMasked ? 'Afficher les montants' : 'Masquer les montants'}
      title={moneyMasked ? 'Afficher les montants' : 'Masquer les montants'}
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground ${className}`}
    >
      <Icon i={moneyMasked ? 'eye-off' : 'eye'} size={16} />
    </button>
  );
}
