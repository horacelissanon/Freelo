'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useCreateMenu, type CreateEntity } from '@/contexts/CreateMenuContext';
import { useBottomNavStyle, type BottomNavGlass } from '@/contexts/BottomNavStyleContext';
import { useSidebarShape, type SidebarShape } from '@/contexts/SidebarShapeContext';

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

// Pairs the desktop sidebar's shape choice (Paramètres → Espace → Forme du
// menu) with a matching mobile silhouette, so switching breakpoints reads
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

const RIGHT_ITEMS = [
  { icon: 'users', label: 'Clients', href: '/clients' },
  { icon: 'file-text', label: 'Factures', href: '/invoices' },
] as const;

const QUICK_ACTIONS: { icon: string; label: string; entity: CreateEntity }[] = [
  { icon: 'folder-open', label: 'Nouveau projet', entity: 'project' },
  { icon: 'users', label: 'Nouveau client', entity: 'client' },
  { icon: 'file-text', label: 'Nouveau devis', entity: 'quote' },
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

export function BottomNav() {
  const pathname = usePathname();
  const { openCreate } = useCreateMenu();
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
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.entity}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  openCreate(action.entity);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm text-foreground hover:bg-secondary"
              >
                <Icon i={action.icon} size={16} />
                {action.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative flex items-center px-2">
          {LEFT_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname?.startsWith(item.href) ?? false}
              glass={glass}
            />
          ))}

          <div className="flex flex-1 justify-center">
            <button
              type="button"
              aria-label={menuOpen ? 'Fermer les actions rapides' : 'Actions rapides'}
              onClick={() => setMenuOpen((v) => !v)}
              className={`-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ${
                glass !== 'off' ? 'ring-2 ring-white/25' : ''
              }`}
            >
              <Icon i={menuOpen ? 'x' : 'plus'} size={24} />
            </button>
          </div>

          {RIGHT_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname?.startsWith(item.href) ?? false}
              glass={glass}
            />
          ))}
        </div>
      </nav>
    </>
  );
}
