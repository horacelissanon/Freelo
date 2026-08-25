'use client';

// Dismissible top announcement strip — structurally inspired by
// dailykash.app's own promo bar, but the offer itself is real: WELCOME is a
// live Coupon row (10% off, MONTHLY cycle — see the Super Admin → Plans
// coupon list), not decorative copy. Sits inside the same fixed block as
// the header (page.tsx) so both move together; the header doesn't need its
// own top-offset math for whether this is mounted/dismissed.
//
// Same SSR-safe dismiss pattern as InstallPromptWidget.tsx: renders visible
// on the server and on first client paint (both agree, no hydration
// mismatch), then hides itself post-mount if sessionStorage says it was
// already dismissed this session.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

const DISMISSED_KEY = 'zefacto-promo-banner-dismissed';

export function PromoBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISSED_KEY) === '1') setDismissed(true);
    } catch {
      // Storage unavailable — banner just stays visible for this visit.
    }
  }, []);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Best-effort — the in-memory state above still hides it this session.
    }
  }

  return (
    <div className="flex items-center justify-center gap-2 bg-primary px-4 py-2 text-center sm:px-6">
      <Icon i="tag" size={14} className="hidden flex-shrink-0 text-primary-foreground sm:block" />
      <p className="font-body text-xs font-medium text-primary-foreground sm:text-sm">
        <span className="hidden sm:inline">Bienvenue ! </span>
        Profite de{' '}
        <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 font-semibold">
          -10% sur ton 1er mois Pro
        </span>{' '}
        avec le code{' '}
        <span className="rounded-full bg-primary-foreground/90 px-2 py-0.5 font-semibold text-primary">
          WELCOME
        </span>
      </p>
      <Link
        href="/login?mode=signup"
        className="hidden flex-shrink-0 font-body text-xs font-semibold whitespace-nowrap text-primary-foreground underline underline-offset-2 hover:no-underline sm:inline"
      >
        Découvrir l’offre
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer la bannière"
        className="ml-1 flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground"
      >
        <Icon i="x" size={13} />
      </button>
    </div>
  );
}
