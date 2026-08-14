'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

// Small "i" affordance for buttons/labels whose purpose isn't obvious from
// the label alone. Click-to-toggle (not just hover) so it works on touch —
// most of this app's screens are used on mobile in the field.
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Aide"
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <Icon i="info" size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-md border border-border bg-canvas px-3 py-2 text-left font-body text-xs font-normal text-foreground shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}
