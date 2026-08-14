'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useCreateMenu, type CreateEntity } from '@/contexts/CreateMenuContext';

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
}: {
  icon: string;
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-1 py-2 font-body text-[11px] ${
        active ? 'text-primary' : 'text-sidebar-foreground/60'
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

      <nav className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-sidebar-muted bg-sidebar shadow-lg lg:hidden">
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
            <NavItem key={item.href} {...item} active={pathname?.startsWith(item.href) ?? false} />
          ))}

          <div className="flex flex-1 justify-center">
            <button
              type="button"
              aria-label={menuOpen ? 'Fermer les actions rapides' : 'Actions rapides'}
              onClick={() => setMenuOpen((v) => !v)}
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
            >
              <Icon i={menuOpen ? 'x' : 'plus'} size={24} />
            </button>
          </div>

          {RIGHT_ITEMS.map((item) => (
            <NavItem key={item.href} {...item} active={pathname?.startsWith(item.href) ?? false} />
          ))}
        </div>
      </nav>
    </>
  );
}
