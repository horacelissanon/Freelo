'use client';

// The landing page's header is a Server Component with no request-time auth
// signal, so this small client island (same pattern as ThemeToggle/
// PricingToggle on this same page) reads the session client-side and swaps
// the logged-out CTAs for a single "Tableau de bord" link once a session is
// confirmed. `user` starts `null` on both server and first client render
// (AuthContext's SSR stub), so the initial paint always matches the
// logged-out markup below — no hydration mismatch, just a swap once the
// /api/auth/me check resolves.
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export function HeaderAuthCta() {
  const { user } = useAuth();

  if (user) {
    return (
      <Link
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 font-body text-sm font-medium text-primary-foreground"
      >
        Tableau de bord
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="hidden font-body text-sm font-medium text-foreground sm:inline"
      >
        Se connecter
      </Link>
      <Link
        href="/login?mode=signup"
        className="rounded-md bg-primary px-4 py-2 font-body text-sm font-medium text-primary-foreground"
      >
        Commencer gratuitement
      </Link>
    </>
  );
}
