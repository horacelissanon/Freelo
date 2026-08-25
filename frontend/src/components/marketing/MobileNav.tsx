'use client';

// Mobile-only header nav (< md — the header's own inline nav links and
// ThemeToggle/HeaderAuthCta pair are `hidden md:flex` at that point, so
// without this there was no way to reach #comment-ca-marche/#comparatif/
// #tarifs/#faq from a phone at all). ThemeToggle is rendered inline here
// too (its own separate instance, not shared with the desktop one) rather
// than tucked in the dropdown, so it stays reachable in one tap. Auth-aware
// like HeaderAuthCta right next to it in the header — same useAuth() check,
// kept as its own small duplication rather than sharing a hook, since the
// two components render genuinely different markup (this one drives a
// whole dropdown, not just a CTA pair).
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';

const NAV_LINKS = [
  { href: '#comment-ca-marche', label: 'Comment ça marche' },
  { href: '#comparatif', label: 'Comparatif' },
  { href: '#tarifs', label: 'Tarifs' },
  { href: '#faq', label: 'FAQ' },
];

export function MobileNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex items-center gap-1.5 md:hidden">
      <ThemeToggle />
      <Link
        href={user ? '/dashboard' : '/login?mode=signup'}
        className="flex-shrink-0 rounded-md bg-primary px-3 py-1.5 font-body text-sm font-medium whitespace-nowrap text-primary-foreground"
      >
        {user ? 'Tableau de bord' : 'Commencer gratuitement'}
      </Link>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground hover:bg-secondary"
      >
        <Icon i={open ? 'x' : 'menu'} size={18} />
      </button>

      {open && (
        <>
          {/* Full-viewport tap-to-close catcher, under the panel (lower
              z-index) so the panel's own links/buttons stay clickable. */}
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="animate-fade-in absolute top-full right-0 z-50 mt-3 w-64 overflow-hidden rounded-xl border border-border bg-canvas shadow-xl">
            <nav className="flex flex-col p-2" aria-label="Navigation">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 font-body text-sm font-medium text-foreground hover:bg-secondary"
                >
                  {l.label}
                </a>
              ))}
            </nav>
            {!user && (
              <div className="border-t border-border p-3">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="block rounded-md border border-border px-4 py-2.5 text-center font-body text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  Se connecter
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
