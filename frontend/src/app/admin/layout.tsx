'use client';

// Super Admin console — deliberately its OWN shell, not nested inside
// (app)/layout.tsx. This is the SaaS operator's view of the whole platform
// (every freelancer's account, subscriptions, platform revenue), which is a
// different persona from a freelancer's own workspace — the two must never
// share a nav (a freelancer must never see "Administration" in their own
// sidebar, and this console must never show Projets/Clients/Devis/Factures).
// Reuses only the root-level providers (AuthProvider/ToastProvider from
// app/layout.tsx) — none of the (app)-scoped ones (DisplayCurrency,
// MoneyMask, workspace theming) apply here, on purpose.
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const GENERAL_NAV: NavItem[] = [
  { href: '/admin', label: "Vue d'ensemble", icon: 'layout-dashboard' },
  { href: '/admin/users', label: 'Utilisateurs', icon: 'users' },
  { href: '/admin/subscriptions', label: 'Abonnements', icon: 'credit-card' },
  { href: '/admin/transactions', label: 'Facturation', icon: 'banknote' },
  { href: '/admin/support', label: 'Support', icon: 'message-circle' },
];

const SYSTEM_NAV: NavItem[] = [
  { href: '/admin/performance', label: 'Performances', icon: 'bar-chart' },
  { href: '/admin/audit-log', label: "Journal d'audit", icon: 'file-clock' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

function NavSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div>
      <p className="mb-1 px-2 font-body text-[11px] font-semibold tracking-widest text-white/30 uppercase">
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 font-body text-sm font-medium transition-colors ${
                active
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon i={item.icon} size={16} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  onNavigate,
  user,
  logout,
  loggingOut,
}: {
  pathname: string;
  onNavigate: () => void;
  user: { name: string | null; email: string; role: 'ADMIN' | 'SUPERADMIN' };
  logout: () => void;
  loggingOut: boolean;
}) {
  return (
    <>
      <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2.5 px-2 pb-6">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500">
          <Icon i="shield" size={18} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-headings text-base font-bold text-white">Super Admin</p>
          <p className="truncate font-body text-[11px] text-white/40">Console plateforme</p>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
        <NavSection
          title="Général"
          items={GENERAL_NAV}
          pathname={pathname}
          onNavigate={onNavigate}
        />
        <NavSection
          title="Système"
          items={SYSTEM_NAV}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      </nav>

      <div className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-4">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-body text-sm text-white/50 hover:bg-white/5 hover:text-white"
        >
          <Icon i="external-link" size={16} />
          Retour à Freelo
        </Link>
        <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 font-headings text-xs font-bold text-white">
            {(user.name || user.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-body text-sm font-medium text-white">
              {user.role === 'SUPERADMIN' ? 'Super Admin' : 'Admin'}
            </p>
            <p className="truncate font-body text-xs text-white/40">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            disabled={loggingOut}
            aria-label="Déconnexion"
            title="Déconnexion"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <Icon i="log-out" size={14} />
          </button>
        </div>
      </div>
    </>
  );
}

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout, loggingOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role === 'USER')) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (loading || !user || user.role === 'USER') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0d12]">
        <p className="font-body text-sm text-white/50">Chargement…</p>
      </div>
    );
  }

  const role = user.role as 'ADMIN' | 'SUPERADMIN';

  return (
    <div className="min-h-screen bg-[#f4f5f7] lg:flex">
      {/* Mobile top bar — the fixed desktop <aside> below is hidden under lg,
          so small screens need their own entry point into the same nav. */}
      <div className="flex items-center justify-between bg-[#12141a] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Ouvrir le menu"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Icon i="menu" size={20} />
          </button>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500">
            <Icon i="shield" size={14} className="text-white" />
          </div>
          <span className="font-headings text-base font-bold text-white">Super Admin</span>
        </div>
      </div>

      {drawerOpen && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setDrawerOpen(false)}
          className="animate-fade-in fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
      <div
        className={`animate-slide-in-left fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col bg-[#12141a] px-4 py-6 lg:hidden ${
          drawerOpen ? '' : 'hidden'
        }`}
      >
        <SidebarContent
          pathname={pathname}
          onNavigate={() => setDrawerOpen(false)}
          user={{ name: user.name, email: user.email, role }}
          logout={() => void logout()}
          loggingOut={loggingOut}
        />
      </div>

      {/* Desktop sidebar — fixed, lg and up. */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-shrink-0 lg:flex-col lg:bg-[#12141a] lg:px-4 lg:py-6">
        <SidebarContent
          pathname={pathname}
          onNavigate={() => {}}
          user={{ name: user.name, email: user.email, role }}
          logout={() => void logout()}
          loggingOut={loggingOut}
        />
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
