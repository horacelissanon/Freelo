'use client';

// Pill button cycling XOF → EUR → USD, sharing DisplayCurrencyContext
// (localStorage key 'merrudit-display-currency') across every page — same
// placement pattern as ThemeToggle (Sidebar + mobile top bar), authenticated
// app only (no session/default currency on public pages). Styled as a
// bordered pill with a chevron (not bare text like ThemeToggle's plain
// icon-circle) so it reads as an interactive selector rather than a label.
import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useDisplayCurrency } from '@/contexts/DisplayCurrencyContext';

const LABEL: Record<string, string> = {
  XOF: 'Afficher les montants en XOF',
  EUR: 'Afficher les montants en EUR',
  USD: 'Afficher les montants en USD',
};

const HINT_DISMISSED_KEY = 'merrudit-currency-hint-dismissed';
const HINT_WIDTH = 272;

export function DisplayCurrencyToggle({ className = '' }: { className?: string }) {
  const { displayCurrency, cycleDisplayCurrency } = useDisplayCurrency();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [showHint, setShowHint] = useState(false);
  // Computed from the button's own on-screen position (position: fixed, not
  // absolute) so the hint sits right next to whichever toggle was clicked —
  // Sidebar or mobile top bar — without being clipped by the Sidebar's own
  // overflow-hidden (which would swallow an absolutely-positioned popover).
  const [hintPos, setHintPos] = useState<{ top: number; left: number } | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  function closeHint() {
    setShowHint(false);
    if (dontShowAgain) {
      try {
        localStorage.setItem(HINT_DISMISSED_KEY, '1');
      } catch {
        // Preference still applies for this session, just won't persist.
      }
    }
  }

  function handleClick() {
    cycleDisplayCurrency();
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(HINT_DISMISSED_KEY) === '1';
    } catch {
      // Storage unavailable — show the hint, same as a first-time visit.
    }
    if (dismissed) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setHintPos({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - HINT_WIDTH - 8)),
      });
    }
    setShowHint(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        aria-label={`${LABEL[displayCurrency]} — cliquer pour changer`}
        title={LABEL[displayCurrency]}
        className={`flex h-8 flex-shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-secondary/40 px-2.5 font-body text-[11px] font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground ${className}`}
      >
        {displayCurrency}
        <Icon i="chevron-down" size={12} className="opacity-70" />
      </button>

      {showHint && hintPos && (
        <div
          className="fixed z-50 rounded-lg border border-border bg-canvas p-3 shadow-xl"
          style={{ top: hintPos.top, left: hintPos.left, width: HINT_WIDTH }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-body text-xs text-foreground">
              Seuls les totaux globaux changent de devise — vos projets, devis et factures gardent
              leur devise d&apos;origine.
            </p>
            <button
              type="button"
              onClick={closeHint}
              aria-label="Fermer"
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Icon i="x" size={13} />
            </button>
          </div>
          <label className="mt-2 flex items-center gap-1.5 font-body text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Ne plus afficher ce message
          </label>
        </div>
      )}
    </>
  );
}
