// Inline upgrade nudge shown when a mutation is rejected by plan-tier
// gating (lib/server/billing/plans.ts's getPlanConfig, enforced in
// /api/clients, /api/projects, /api/invoices). Forms check
// `isPlanLimitCode(err.code)` and render this instead of the generic
// error line so the dead-end (403) becomes an actionable upsell.
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

const PLAN_LIMIT_CODES = new Set([
  'PLAN_LIMIT_CLIENTS',
  'PLAN_LIMIT_PROJECTS',
  'PLAN_LIMIT_CURRENCY',
  'PLAN_LIMIT_INVOICES',
  'PLAN_LIMIT_QUOTES',
  'PLAN_REQUIRES_PRO',
]);

export function isPlanLimitCode(code: string): boolean {
  return PLAN_LIMIT_CODES.has(code);
}

// Amber/orange + crown — same billing accent and badge as the Pro plan
// cards on FacturationTab.tsx and every other Pro-locked control, so this
// dead-end (a rejected mutation) reads as the same "this is Pro" signal
// instead of a generic app-primary-colored hint.
export function PlanLimitPrompt({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2">
        <Icon i="crown" size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
        <p className="font-body text-sm text-foreground">{message}</p>
      </div>
      <Link
        href="/settings?tab=abonnement"
        className="flex items-center gap-1.5 self-start rounded-md bg-gradient-to-br from-amber-500 to-orange-600 px-3 py-1.5 font-body text-xs font-medium text-white"
      >
        <Icon i="crown" size={12} />
        Passer en Pro
      </Link>
    </div>
  );
}
