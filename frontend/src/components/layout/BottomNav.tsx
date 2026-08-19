'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useBottomNavStyle, type BottomNavGlass } from '@/contexts/BottomNavStyleContext';
import { useSidebarShape, type SidebarShape } from '@/contexts/SidebarShapeContext';
import { isNavItemActive } from '@/lib/navActive';

// 'off' keeps the original solid brand-green bar untouched. Both glass
// variants stay green on purpose (per product decision — a liquid-glass
// look inspired by Apple's effect, without giving up the brand color).
// Earlier attempt used low opacity (25-55%) which, over a plain light page,
// just reads as a washed-out flat color rather than glass, and made the
// white nav-item text barely legible on the pale 'tinted' variant — fixed
// by keeping enough opacity for contrast and adding a top sheen highlight
// (see the overlay div below) that actually sells the "glass" read.
// 'transparent' stays close to the dark sidebar hue (more neutral/clear);
// 'tinted' leans on the brighter --color-primary green (more saturated/colored).
const GLASS_NAV_CLASS: Record<BottomNavGlass, string> = {
  off: 'border-sidebar-muted bg-sidebar',
  transparent: 'border-white/15 bg-sidebar/75 backdrop-blur-2xl backdrop-saturate-150',
  tinted: 'border-white/20 bg-primary/60 backdrop-blur-2xl backdrop-saturate-150',
};

// Pairs the desktop sidebar's shape choice (Mon compte → Affichage → Forme
// du menu) with a matching mobile silhouette, so switching breakpoints reads
// as the same pick, not a different nav entirely. 'classic' mirrors the
// original flush edge-to-edge bar; 'capsule' is the full-width floating
// pill (the shipped default look); 'dock' is a compact, centered floating
// pill echoing the desktop dock's short, content-sized shape.
const SHAPE_NAV_CLASS: Record<SidebarShape, string> = {
  classic: 'inset-x-0 bottom-0 rounded-t-2xl',
  capsule: 'inset-x-3 bottom-3 rounded-2xl',
  dock: 'bottom-3 left-1/2 w-[min(92vw,420px)] -translate-x-1/2 rounded-full',
};
const SHAPE_OVERLAY_RADIUS: Record<SidebarShape, string> = {
  classic: 'rounded-t-2xl',
  capsule: 'rounded-2xl',
  dock: 'rounded-full',
};

const LEFT_ITEMS = [
  { icon: 'layout-dashboard', label: 'Tableau de bord', href: '/dashboard' },
  { icon: 'folder-open', label: 'Projets', href: '/projects' },
] as const;

const RIGHT_ITEMS = [{ icon: 'users', label: 'Clients', href: '/clients' }] as const;

const ACCOUNT_HREF = '/settings?tab=compte';

// Plain navigation links only — sections with no dedicated slot among the 4
// fixed LEFT_ITEMS/RIGHT_ITEMS, so they ride the central FAB's popup instead
// of forcing a 5th/6th fixed icon onto the bar. Quick-create actions
// (Nouveau projet/client/devis) live on the Dashboard instead, so they don't
// duplicate here. Factures sits right after Devis, its normal pairing (same
// order as the desktop Sidebar) — it lost its fixed RIGHT_ITEMS slot to Mon
// compte. Abonnement lives here too — on mobile there's no separate sidebar
// to hold its permanently-amber entry. No separate Paramètres entry:
// Affichage/Sécurité/Support/Abonnement are all tabs inside "Mon compte" now,
// which is the single settings hub.
interface QuickMenuItem {
  icon: string;
  label: string;
  href: string;
  amber?: boolean;
}

const QUICK_MENU: QuickMenuItem[] = [
  { icon: 'file-text', label: 'Devis', href: '/invoices?tab=devis' },
  { icon: 'receipt', label: 'Factures', href: '/invoices?tab=factures' },
  { icon: 'bar-chart', label: 'Statistiques', href: '/stats' },
  { icon: 'star', label: 'Avis clients', href: '/reviews' },
  { icon: 'credit-card', label: 'Abonnement', href: '/settings?tab=abonnement', amber: true },
];

function NavItem({
  icon,
  label,
  href,
  active,
  glass,
}: {
  icon: string;
  label: string;
  href: string;
  active: boolean;
  glass: BottomNavGlass;
}) {
  // On the solid bar, the active tab reads fine in the brand green against
  // the near-black sidebar. On the 'tinted' glass variant the background is
  // that same green family, so text-primary on it would nearly vanish —
  // white stays legible on every variant, so glass modes always use it.
  const activeClass = glass === 'off' ? 'text-primary' : 'text-white';
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-1 py-2 font-body text-[11px] ${
        active ? activeClass : 'text-sidebar-foreground/60'
      }`}
    >
      <Icon i={icon} size={20} />
      {label}
    </Link>
  );
}

// "Mon compte" gets the freelance's own avatar instead of a generic
// icon+label, same idea as the desktop Sidebar/mobile top bar — the photo
// (or initials fallback) already says "this is you" without spelling it out.
// The avatar alone read as a bare floating image next to its icon+label
// siblings, so it's wrapped in the same bg-sidebar-muted/40 chip as the
// desktop Sidebar's own "Mon compte" row — the mobile top bar's /5 version
// is nearly invisible once the pill is as small/round as the avatar itself.
function AccountNavItem({
  href,
  active,
  name,
  avatarUrl,
  glass,
}: {
  href: string;
  active: boolean;
  name: string;
  avatarUrl: string | null;
  glass: BottomNavGlass;
}) {
  const pillClass =
    active && glass === 'off'
      ? 'border-primary bg-primary/15'
      : active
        ? 'border-white/70 bg-white/15'
        : 'border-transparent bg-sidebar-muted/40 hover:bg-sidebar-muted';
  return (
    <Link href={href} className="flex flex-1 items-center justify-center py-2">
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${pillClass}`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <Avatar name={name} className="h-7 w-7 flex-shrink-0 text-[11px]" />
        )}
      </span>
    </Link>
  );
}

// useSearchParams() opts a subtree out of static rendering unless wrapped in
// Suspense — same reasoning as Sidebar.tsx's identical wrapper.
export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavBody activeTab={null} />}>
      <BottomNavWithTab />
    </Suspense>
  );
}

function BottomNavWithTab() {
  const searchParams = useSearchParams();
  return <BottomNavBody activeTab={searchParams.get('tab')} />;
}

function BottomNavBody({ activeTab }: { activeTab: string | null }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { glass } = useBottomNavStyle();
  const { shape } = useSidebarShape();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {menuOpen && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setMenuOpen(false)}
          className="animate-fade-in fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <nav
        className={`fixed z-40 border shadow-lg lg:hidden ${SHAPE_NAV_CLASS[shape]} ${GLASS_NAV_CLASS[glass]}`}
      >
        {glass !== 'off' && (
          <div
            className={`pointer-events-none absolute inset-0 ${SHAPE_OVERLAY_RADIUS[shape]} bg-gradient-to-b from-white/20 via-white/0 to-black/10`}
          />
        )}

        {menuOpen && (
          <div className="animate-scale-in absolute bottom-full left-1/2 mb-3 w-52 -translate-x-1/2 origin-bottom rounded-lg border border-border bg-canvas shadow-card p-2 shadow-xl">
            {QUICK_MENU.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm hover:bg-secondary ${
                  item.amber ? 'text-amber-500 dark:text-amber-400' : 'text-foreground'
                }`}
              >
                <Icon i={item.icon} size={16} />
                {item.label}
              </Link>
            ))}
          </div>
        )}

        <div className="relative flex items-center px-2">
          {LEFT_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={isNavItemActive(pathname, activeTab, item.href)}
              glass={glass}
            />
          ))}

          <div className="flex flex-1 justify-center">
            <button
              type="button"
              aria-label={menuOpen ? 'Fermer le menu rapide' : 'Menu rapide'}
              onClick={() => setMenuOpen((v) => !v)}
              className={`-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ${
                glass !== 'off' ? 'ring-2 ring-white/25' : ''
              }`}
            >
              <Icon i={menuOpen ? 'x' : 'layout-grid'} size={24} />
            </button>
          </div>

          {RIGHT_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={isNavItemActive(pathname, activeTab, item.href)}
              glass={glass}
            />
          ))}
          {user && (
            <AccountNavItem
              href={ACCOUNT_HREF}
              active={isNavItemActive(pathname, activeTab, ACCOUNT_HREF)}
              name={user.name || user.email}
              avatarUrl={user.avatarUrl}
              glass={glass}
            />
          )}
        </div>
      </nav>
    </>
  );
}
