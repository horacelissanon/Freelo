'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

// Detail pages are reached from many different places (a client's page, a
// project's page, the dashboard, a search…), so a "Retour" link that always
// points at one fixed parent list sends the user back to square one even
// after they've drilled down through several screens. router.back() follows
// whatever path they actually took instead. window.history.length <= 1 means
// this tab has no in-app history yet (direct link, new tab, page refresh) —
// only then do we fall back to a fixed destination, so the button is never
// a dead end.
export function BackButton({
  fallbackHref,
  label,
  className = '',
}: {
  fallbackHref: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={`inline-flex items-center gap-1 font-body text-sm text-muted-foreground hover:text-foreground ${className}`}
    >
      <Icon i="chevron-left" size={16} />
      {label}
    </button>
  );
}
