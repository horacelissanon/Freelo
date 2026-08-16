'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  NotificationBell,
  type NotificationBellItem,
} from '@/components/dashboard/NotificationBell';
import { useUser, useAuth } from '@/contexts/AuthContext';
import { useSidebarShape } from '@/contexts/SidebarShapeContext';
import { useMobileNavStyle } from '@/contexts/MobileNavStyleContext';
import { CreateMenuProvider } from '@/contexts/CreateMenuContext';
import { InstallPromptWidget } from '@/components/InstallPromptWidget';
import { useApi, invalidateCachePrefix } from '@/lib/useApi';
import { api } from '@/lib/api';

const COLLAPSE_STORAGE_KEY = 'merrudit-sidebar-collapsed';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const { logout, loggingOut } = useAuth();
  const { shape } = useSidebarShape();
  const { navStyle } = useMobileNavStyle();
  const floating = shape === 'capsule' || shape === 'dock';
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notifications = useApi<{ items: NotificationBellItem[] }>('/api/notifications?limit=8');
  const notifCount = useApi<{ count: number }>('/api/notifications/count');

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1') setCollapsed(true);
  }, []);

  async function markAllNotificationsRead() {
    await api('/api/notifications', { method: 'PATCH', body: { ids: 'all' } });
    invalidateCachePrefix('/api/notifications');
  }

  async function markNotificationRead(id: string) {
    await api('/api/notifications', { method: 'PATCH', body: { ids: [id] } });
    invalidateCachePrefix('/api/notifications');
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-body text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  return (
    <CreateMenuProvider>
      <div className="min-h-screen bg-background lg:flex">
        {/* Desktop sidebar — fixed, lg and up, collapsible to icon-only.
            Shape is a user preference (Paramètres → Espace → Forme du
            menu): 'classic' sits flush against the viewport edge like a
            bordered column; 'capsule'/'dock' get a p-4 inset so they float
            off the edges instead — 'dock' additionally centers vertically
            since it doesn't stretch to fill the column like 'capsule'. */}
        <div
          className={`hidden lg:block lg:flex-shrink-0 ${
            floating ? (collapsed ? 'lg:w-24' : 'lg:w-64') : collapsed ? 'lg:w-16' : 'lg:w-56'
          }`}
        >
          <div
            className={
              floating
                ? `fixed inset-y-0 left-0 p-4 ${shape === 'dock' ? 'flex items-center' : ''} ${collapsed ? 'w-24' : 'w-64'}`
                : `fixed h-screen border-r border-border ${collapsed ? 'w-16' : 'w-56'}`
            }
          >
            <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} shape={shape} />
          </div>
        </div>

        {/* Mobile top bar */}
        <div className="border-b border-border bg-sidebar lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              {/* Hamburger only shown in 'drawer' mode (Paramètres → Espace →
                  Navigation mobile) — in the default 'bottom' mode, BottomNav
                  is the way to reach navigation, so there's nothing for this
                  button to open. */}
              {navStyle === 'drawer' && (
                <button
                  type="button"
                  aria-label="Ouvrir le menu"
                  onClick={() => setDrawerOpen(true)}
                  className="-ml-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-muted/60 hover:text-sidebar-foreground"
                >
                  <Icon i="menu" size={20} />
                </button>
              )}
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                <span className="font-headings text-base font-bold text-primary-foreground">F</span>
              </div>
              <span className="font-headings text-lg font-bold tracking-tight text-sidebar-foreground">
                Freelo
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle className="!text-sidebar-foreground/70 hover:!bg-sidebar-muted/60 hover:!text-sidebar-foreground" />
              <NotificationBell
                unreadCount={notifCount.data?.count ?? 0}
                notifications={notifications.data?.items ?? []}
                onMarkAllRead={() => void markAllNotificationsRead()}
                onMarkRead={(id) => void markNotificationRead(id)}
              />
              <Link
                href="/settings"
                className="flex items-center gap-2 rounded-md py-1 pr-1 pl-2 text-sidebar-foreground/70"
              >
                <span className="font-body text-xs font-medium">Mon compte</span>
                <Avatar name={user.name || user.email} className="h-8 w-8 flex-shrink-0 text-xs" />
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                disabled={loggingOut}
                aria-label="Déconnexion"
                title="Déconnexion"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-red-500 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
              >
                <Icon i="log-out" size={17} />
              </button>
            </div>
          </div>
        </div>

        {/* pb-24 reserves room for the floating BottomNav — not needed in
            'drawer' mode, where mobile has no bottom-docked element. */}
        <main className={`min-w-0 flex-1 ${navStyle === 'drawer' ? 'pb-6' : 'pb-24'} lg:pb-0`}>
          {children}
        </main>

        {navStyle === 'drawer' ? (
          <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} shape={shape} />
        ) : (
          <BottomNav />
        )}
        <InstallPromptWidget variant="app" bottomNavVisible={navStyle === 'bottom'} />
      </div>
    </CreateMenuProvider>
  );
}
