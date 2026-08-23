import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

// Same conditional-slot pattern as AlertBanner (dashboard/page.tsx renders
// this right below it), but styled in the same amber/orange as
// FacturationTab.tsx's "Abonnement actuel" card and the Sidebar's Pro
// pitch — one consistent "this is about billing" color across every
// Pro-upsell surface, bold enough to read as a banner, not a hint.
export function ProUpsellBanner() {
  return (
    <Link
      href="/settings?tab=abonnement"
      className="flex items-center gap-3 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 px-4 py-3 font-body text-sm font-medium text-white shadow-card"
    >
      <Icon i="crown" size={16} className="flex-shrink-0 text-white" />
      <span className="flex-1">
        Passe en Pro pour les factures en EUR/USD, ton logo sur tes documents et plus de clients.
      </span>
      <span className="flex-shrink-0 text-xs font-semibold whitespace-nowrap text-white underline">
        Découvrir →
      </span>
    </Link>
  );
}
