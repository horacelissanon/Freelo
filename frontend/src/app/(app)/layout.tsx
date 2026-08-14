'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { Avatar } from '@/components/ui/Avatar';
import { useUser } from '@/contexts/AuthContext';
import { CreateMenuProvider } from '@/contexts/CreateMenuContext';

const COLLAPSE_STORAGE_KEY = 'merrudit-sidebar-collapsed';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useUser();
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
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-md py-1 pr-1 pl-2 text-sidebar-foreground/70"
            >
              <span className="font-body text-xs font-medium">Mon compte</span>
              <Avatar name={user.email} className="h-8 w-8 flex-shrink-0 text-xs" />
            </Link>
          </div>
        </div>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>

        <BottomNav />
      </div>
    </CreateMenuProvider>
  );
}
