'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { DisplayCurrencyToggle } from '@/components/DisplayCurrencyToggle';
import { MoneyMaskToggle } from '@/components/MoneyMaskToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { useBottomNavStyle, type BottomNavGlass } from '@/contexts/BottomNavStyleContext';
import { useSidebarColor } from '@/contexts/SidebarColorContext';
import type { SidebarShape } from '@/contexts/SidebarShapeContext';
import { isNavItemActive } from '@/lib/navActive';
import { isLightColor } from '@/lib/color';

const NAV_ITEMS = [
  { icon: 'layout-dashboard', label: 'Tableau de bord', href: '/dashboard' },
  { icon: 'folder-open', label: 'Projets', href: '/projects' },
  { icon: 'users', label: 'Clients', href: '/clients' },
  { icon: 'file-text', label: 'Devis', href: '/invoices?tab=devis' },
  { icon: 'receipt', label: 'Factures', href: '/invoices?tab=factures' },
  { icon: 'bar-chart', label: 'Statistiques', href: '/stats' },
  { icon: 'star', label: 'Avis clients', href: '/reviews' },
  { icon: 'message-circle', label: 'Support', href: '/settings?tab=support' },
] as const;

interface SidebarProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** 'classic' = flush edge-to-edge rail (default). 'capsule' = full-height
   *  floating pill. 'dock' = compact floating pill, vertically centered
   *  instead of stretched. Opt-in via Mon compte → Affichage → Forme du menu. */
  shape?: SidebarShape;
}

// Glass background, shared with BottomNav's GLASS_NAV_CLASS — the single
// "Menu liquid glass" setting in Mon compte → Affichage drives both surfaces
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
// useSearchParams() opts a subtree out of static rendering unless wrapped
// in Suspense (Next.js App Router requirement — same reason
// app/(app)/invoices/page.tsx wraps its own ?tab= read). Sidebar is mounted
// on every page in the app, so the boundary lives here once instead of at
// every call site.
export function Sidebar(props: SidebarProps) {
  return (
    <Suspense fallback={<SidebarBody {...props} activeTab={null} />}>
      <SidebarWithTab {...props} />
    </Suspense>
  );
}

function SidebarWithTab(props: SidebarProps) {
  const searchParams = useSearchParams();
  return <SidebarBody {...props} activeTab={searchParams.get('tab')} />;
}

function SidebarBody({
  onNavigate = () => {},
  collapsed = false,
  onToggleCollapsed,
  shape = 'classic',
  activeTab,
}: SidebarProps & { activeTab: string | null }) {
  const pathname = usePathname();
  const { user, logout, loggingOut } = useAuth();
  const { glass } = useBottomNavStyle();
  // Loaded lazily here (not lifted to a shared context) — only this sidebar
  // card needs it, and `subscriptionData` staying null until it resolves is
  // what keeps a Pro account from flashing the "Passe en Pro" pitch below.
  const { data: subscriptionData } = useApi<{ subscription: { isProActive: boolean } }>(
    '/api/billing/subscription',
  );
  const isProActive = subscriptionData?.subscription.isProActive ?? false;
  const showProPitch = !collapsed && subscriptionData && !isProActive;
  const { effectiveSidebarColor } = useSidebarColor();
  // A light menu background (freelance picked a pale/white "Couleur du
  // menu") automatically swaps the solid active-item fill for a soft
  // pastel-tinted pill instead — same read as the "sobre et pro" look,
  // derived entirely from the existing background/accent settings rather
  // than a new dedicated toggle. Uses the effective (theme-resolved) color,
  // not the raw stored pick — in dark mode the "Sobre & clair" white preset
  // renders as a dark substitute (SidebarColorContext.tsx), so this must
  // agree with what's actually painted or the pill styling would mismatch.
  const sober = isLightColor(effectiveSidebarColor);
  const floating = shape === 'capsule' || shape === 'dock';
  const itemShape = floating || sober ? 'rounded-full' : 'rounded-lg';
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

      <div
        className={`relative flex flex-shrink-0 items-center pb-5 ${collapsed ? 'justify-center' : 'justify-between px-2'}`}
      >
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2">
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
        {!collapsed && (
          <div className="flex items-center gap-1">
            <MoneyMaskToggle className="!text-sidebar-foreground/60 hover:!bg-sidebar-muted/60 hover:!text-sidebar-foreground" />
            <DisplayCurrencyToggle className="!border-sidebar-foreground/20 !bg-sidebar-foreground/5 !text-sidebar-foreground/70 hover:!border-sidebar-foreground/35 hover:!bg-sidebar-muted/60 hover:!text-sidebar-foreground" />
          </div>
        )}
      </div>

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
          const active = isNavItemActive(pathname, activeTab, item.href);
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
                  ? sober
                    ? 'bg-primary/15 text-primary'
                    : 'bg-primary text-primary-foreground'
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
        {/* Filled amber/orange banner (same gradient as FacturationTab.tsx's
            "Abonnement actuel" card and the dashboard's ProUpsellBanner) —
            stays permanently visible, not just on hover/active, unlike every
            other nav item, and reads as a banner rather than a plain link so
            it doesn't blend into the rest of the workspace. Lives in the
            main nav instead of buried as a settings tab so the upgrade path
            is always one click away. Free accounts get a richer 2-line
            pitch card instead of the plain link — reuses this same slot
            rather than adding a second Pro-upsell element in the sidebar (a
            Pro account, or a still-loading subscription check, keeps the
            plain link). */}
        {showProPitch ? (
          <Link
            href="/settings?tab=abonnement"
            onClick={onNavigate}
            className={`flex flex-col gap-0.5 bg-gradient-to-br from-amber-500 to-orange-600 ${itemShape === 'rounded-full' ? 'rounded-2xl' : itemShape} px-3 py-2.5 text-white shadow-card`}
          >
            <span className="flex items-center gap-2 font-body text-sm font-semibold">
              <Icon i="crown" size={16} className="text-white" />
              Passe en Pro
            </span>
            <span className="font-body text-xs text-white/80">
              Devises EUR/USD, logo, plus de clients
            </span>
          </Link>
        ) : (
          <Link
            href="/settings?tab=abonnement"
            onClick={onNavigate}
            title={collapsed ? 'Abonnement' : undefined}
            className={`flex items-center gap-3 ${itemShape} font-body text-sm font-medium text-amber-500 hover:bg-amber-500/10 dark:text-amber-400 ${
              collapsed ? 'h-11 w-11 justify-center' : 'px-3 py-2.5'
            }`}
          >
            <Icon i="credit-card" size={16} />
            {!collapsed && 'Abonnement'}
          </Link>
        )}
        {user && (
          <Link
            href="/settings?tab=compte"
            onClick={onNavigate}
            title={collapsed ? 'Mon compte' : undefined}
            className={`mt-1 flex items-center gap-3 ${itemShape} bg-sidebar-muted/40 hover:bg-sidebar-muted ${
              collapsed ? 'h-12 w-12 justify-center' : 'px-2 py-2'
            }`}
          >
            <Avatar name={user.name || user.email} className="h-8 w-8 flex-shrink-0 text-xs" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm font-medium text-sidebar-foreground">
                  {user.email}
                </p>
                <p className="flex items-center gap-1 font-body text-xs text-sidebar-foreground/50">
                  <span className="truncate">Mon compte</span>
                  <span
                    className={`ml-auto flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                      isProActive
                        ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white'
                        : 'bg-sidebar-foreground/10 text-sidebar-foreground/60'
                    }`}
                  >
                    {isProActive ? 'Pro' : 'Gratuit'}
                  </span>
                  <Icon i="chevron-right" size={11} className="flex-shrink-0" />
                </p>
              </div>
            )}
          </Link>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          disabled={loggingOut}
          title={collapsed ? 'Déconnexion' : undefined}
          className={`flex items-center gap-3 ${itemShape} font-body text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400 ${
            collapsed ? 'h-11 w-11 justify-center' : 'px-3 py-2.5'
          }`}
        >
          <Icon i="log-out" size={16} />
          {!collapsed && (loggingOut ? 'Déconnexion…' : 'Déconnexion')}
        </button>
      </div>
    </div>
  );
}
