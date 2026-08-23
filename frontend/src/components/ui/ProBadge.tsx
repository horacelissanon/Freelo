// Small crown pill — the one consistent "this is Pro" visual across the
// app: shown on the Pro plan cards (FacturationTab.tsx) and on every
// Pro-locked control elsewhere (EspaceTab.tsx), so a Free freelance
// recognizes at a glance which controls unlock once they see the same
// badge on the plan they'd need to buy.
import { Icon } from '@/components/ui/Icon';

export function ProBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 px-2 py-0.5 font-body text-[10px] font-semibold tracking-wide text-white uppercase ${className}`}
    >
      <Icon i="crown" size={10} />
      Pro
    </span>
  );
}
