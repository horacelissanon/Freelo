// Inline upgrade nudge shown when a mutation is rejected by plan-tier
// gating (lib/server/billing/subscription.ts's FREE_PLAN_LIMITS, enforced
// in /api/clients, /api/projects, /api/invoices). Forms check
// `isPlanLimitCode(err.code)` and render this instead of the generic
// error line so the dead-end (403) becomes an actionable upsell.
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

const PLAN_LIMIT_CODES = new Set([
  'PLAN_LIMIT_CLIENTS',
  'PLAN_LIMIT_PROJECTS',
  'PLAN_LIMIT_CURRENCY',
  'PLAN_REQUIRES_PRO',
]);

export function isPlanLimitCode(code: string): boolean {
  return PLAN_LIMIT_CODES.has(code);
}

export function PlanLimitPrompt({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-2">
        <Icon i="credit-card" size={16} className="mt-0.5 flex-shrink-0 text-primary" />
        <p className="font-body text-sm text-foreground">{message}</p>
      </div>
      <Link
        href="/settings?tab=abonnement"
        className="self-start rounded-md bg-primary px-3 py-1.5 font-body text-xs font-medium text-primary-foreground"
      >
        Passer en Pro
      </Link>
    </div>
  );
}
