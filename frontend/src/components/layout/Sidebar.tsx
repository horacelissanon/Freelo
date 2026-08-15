'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';

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
}

export function Sidebar({
  onNavigate = () => {},
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={`flex items-center pt-6 pb-4 ${collapsed ? 'justify-center px-3' : 'px-5'}`}>
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary">
            <span className="font-headings text-base font-bold text-primary-foreground">F</span>
          </div>
          {!collapsed && (
            <span className="font-headings text-lg font-bold tracking-tight text-sidebar-foreground">
              Freelo
            </span>
          )}
        </Link>
      </div>

      {onToggleCollapsed && (
        <div className={`pb-4 ${collapsed ? 'px-2' : 'px-3'}`}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
            className={`flex w-full items-center gap-3 rounded-md border border-sidebar-muted py-2 font-body text-xs font-medium text-sidebar-foreground/60 hover:border-sidebar-foreground/20 hover:text-sidebar-foreground ${
              collapsed ? 'justify-center px-2' : 'px-2.5'
            }`}
          >
            <Icon i={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
            {!collapsed && 'Réduire le menu'}
          </button>
        </div>
      )}

      <nav className={collapsed ? 'flex-1 px-2' : 'flex-1 px-3'}>
        {!collapsed && (
          <p className="mb-2 px-2 font-body text-xs tracking-widest text-sidebar-foreground/50 uppercase">
            Espace de travail
          </p>
        )}
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-md py-2.5 font-body text-sm font-medium ${
                  collapsed ? 'justify-center px-2' : 'px-2'
                } ${
                  active
                    ? 'bg-tag-green text-tag-green-fg'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground'
                }`}
              >
                <Icon i={item.icon} size={16} />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className={`flex flex-col gap-0.5 pb-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        <Link
          href="/settings"
          onClick={onNavigate}
          title={collapsed ? 'Paramètres' : undefined}
          className={`flex items-center gap-3 rounded-md py-2.5 font-body text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground ${
            collapsed ? 'justify-center px-2' : 'px-2'
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
            className={`mt-4 flex items-center gap-3 rounded-md border-t border-sidebar-muted pt-4 hover:bg-sidebar-muted/40 ${
              collapsed ? 'justify-center' : 'px-2'
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
