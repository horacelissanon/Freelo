'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useBottomNavStyle, type BottomNavGlass } from '@/contexts/BottomNavStyleContext';
import type { SidebarShape } from '@/contexts/SidebarShapeContext';

const NAV_ITEMS = [
  { icon: 'layout-dashboard', label: 'Tableau de bord', href: '/dashboard' },
  { icon: 'folder-open', label: 'Projets', href: '/projects' },
  { icon: 'users', label: 'Clients', href: '/clients' },
  { icon: 'file-text', label: 'Devis & Factures', href: '/invoices' },
] as const;

interface SidebarProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** 'classic' = flush edge-to-edge rail (default). 'capsule' = full-height
   *  floating pill. 'dock' = compact floating pill, vertically centered
   *  instead of stretched. Opt-in via Paramètres → Espace → Forme du menu. */
  shape?: SidebarShape;
}

// Glass background, shared with BottomNav's GLASS_NAV_CLASS — the single
// "Menu liquid glass" setting in Paramètres → Espace drives both surfaces
// from the same value, so toggling it there changes desktop AND mobile.
// 'off' keeps the solid, user-customizable --color-sidebar token untouched.
const GLASS_SIDEBAR_CLASS: Record<BottomNavGlass, string> = {
  off: 'bg-sidebar',
  transparent: 'bg-sidebar/75 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/15',
  tinted: 'bg-primary/60 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/20',
};

// Three silhouettes sharing one content tree. 'capsule'/'dock' collapsed are
// a full stadium pill (rounded-full on a narrow box caps top/bottom in
// perfect semicircles); expanded widens the rail with a softer fixed radius
// instead (rounded-full at that width would blow the corners into huge
// half-ellipses). 'dock' additionally skips h-full so it sizes to its own
// content and the parent layout centers it vertically, instead of
// stretching to fill the column like 'capsule' does. 'classic' stays flush
// against the viewport edge with just a soft outer-corner sweep.
export function Sidebar({
  onNavigate = () => {},
  collapsed = false,
  onToggleCollapsed,
  shape = 'classic',
}: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { glass } = useBottomNavStyle();
  const floating = shape === 'capsule' || shape === 'dock';
  const itemShape = floating ? 'rounded-full' : 'rounded-lg';
  const outerRadius = floating ? (collapsed ? 'rounded-full' : 'rounded-[28px]') : 'rounded-r-2xl';

  const containerClass = [
    'relative flex flex-col overflow-hidden text-sidebar-foreground',
    shape === 'dock' ? '' : 'h-full',
    GLASS_SIDEBAR_CLASS[glass],
    outerRadius,
    floating ? 'shadow-xl' : '',
    floating && glass === 'off' ? 'ring-1 ring-black/10' : '',
    collapsed ? 'items-center px-2 py-6' : 'px-3 py-6',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClass}>
      {glass !== 'off' && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-white/0 to-black/10" />
      )}

      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={`relative flex flex-shrink-0 items-center gap-2 pb-5 ${collapsed ? 'justify-center' : 'px-2'}`}
      >
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center bg-primary ${floating ? 'rounded-full' : 'rounded-lg'}`}
        >
          <span className="font-headings text-base font-bold text-primary-foreground">F</span>
        </div>
        {!collapsed && (
          <span className="font-headings text-lg font-bold tracking-tight text-sidebar-foreground">
            Freelo
          </span>
        )}
      </Link>

      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
          className={`relative mb-4 flex flex-shrink-0 items-center gap-2 ${itemShape} text-xs font-medium text-sidebar-foreground/60 hover:bg-sidebar-muted/60 hover:text-sidebar-foreground ${
            collapsed ? 'h-9 w-9 justify-center' : 'px-3 py-2'
          }`}
        >
          <Icon i={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
          {!collapsed && 'Réduire le menu'}
        </button>
      )}

      <nav
        className={`relative flex flex-1 flex-col gap-1 overflow-y-auto ${collapsed ? 'items-center' : ''}`}
      >
        {!collapsed && (
          <p className="mb-1 px-2 font-body text-xs tracking-widest text-sidebar-foreground/50 uppercase">
            Espace de travail
          </p>
        )}
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={`flex flex-shrink-0 items-center gap-3 ${itemShape} font-body text-sm font-medium transition-colors ${
                collapsed ? 'h-11 w-11 justify-center' : 'px-3 py-2.5'
              } ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-muted/60 hover:text-sidebar-foreground'
              }`}
            >
              <Icon i={item.icon} size={16} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div
        className={`relative mt-2 flex flex-shrink-0 flex-col gap-1 ${collapsed ? 'items-center' : ''}`}
      >
        <Link
          href="/settings"
          onClick={onNavigate}
          title={collapsed ? 'Paramètres' : undefined}
          className={`flex items-center gap-3 ${itemShape} font-body text-sm text-sidebar-foreground/50 hover:bg-sidebar-muted/60 hover:text-sidebar-foreground ${
            collapsed ? 'h-11 w-11 justify-center' : 'px-3 py-2.5'
          }`}
        >
          <Icon i="settings" size={16} />
          {!collapsed && 'Paramètres'}
        </Link>
        {user && (
          <Link
            href="/settings"
            onClick={onNavigate}
            title={collapsed ? 'Mon compte' : undefined}
            className={`mt-1 flex items-center gap-3 ${itemShape} bg-sidebar-muted/40 hover:bg-sidebar-muted ${
              collapsed ? 'h-12 w-12 justify-center' : 'px-2 py-2'
            }`}
          >
            <Avatar name={user.email} className="h-8 w-8 flex-shrink-0 text-xs" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm font-medium text-sidebar-foreground">
                  {user.email}
                </p>
                <p className="flex items-center gap-1 font-body text-xs text-sidebar-foreground/50">
                  Mon compte
                  <Icon i="chevron-right" size={11} />
                </p>
              </div>
            )}
          </Link>
        )}
      </div>
    </div>
  );
}
