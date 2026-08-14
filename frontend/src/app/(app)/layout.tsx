'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { useUser } from '@/contexts/AuthContext';
import { CreateMenuProvider } from '@/contexts/CreateMenuContext';

const COLLAPSE_STORAGE_KEY = 'merrudit-sidebar-collapsed';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1') setCollapsed(true);
  }, []);

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
        {/* Desktop sidebar — fixed, lg and up, collapsible to icon-only */}
        <div className={`hidden lg:block lg:flex-shrink-0 ${collapsed ? 'lg:w-16' : 'lg:w-56'}`}>
          <div className={`fixed h-screen border-r border-border ${collapsed ? 'w-16' : 'w-56'}`}>
            <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
          </div>
        </div>

        {/* Mobile top bar */}
        <div className="border-b border-border bg-sidebar lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                <span className="font-headings text-base font-bold text-primary-foreground">F</span>
              </div>
              <span className="font-headings text-lg font-bold tracking-tight text-sidebar-foreground">
                Freelo
              </span>
            </div>
            <button
              type="button"
              aria-label="Ouvrir les paramètres du compte"
              onClick={() => setMobileNavOpen(true)}
            >
              <Avatar name={user.email} className="h-8 w-8 text-xs" />
            </button>
          </div>
        </div>

        {/* Mobile nav — floats above content as an overlay drawer, never pushes it down */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setMobileNavOpen(false)}
              className="animate-fade-in absolute inset-0 bg-black/40"
            />
            <div className="animate-slide-in-left absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col border-r border-border bg-sidebar shadow-xl">
              <div className="flex items-center justify-end px-3 pt-3">
                <button
                  type="button"
                  aria-label="Fermer le menu"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70"
                >
                  <Icon i="x" size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Sidebar onNavigate={() => setMobileNavOpen(false)} />
              </div>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>

        <BottomNav />
      </div>
    </CreateMenuProvider>
  );
}
