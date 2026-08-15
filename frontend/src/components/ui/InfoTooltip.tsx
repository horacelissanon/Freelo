'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

const TOOLTIP_WIDTH = 224; // w-56
const VIEWPORT_MARGIN = 12;

type Align = 'left' | 'center' | 'right';

// Small "i" affordance for buttons/labels whose purpose isn't obvious from
// the label alone. Click-to-toggle (not just hover) so it works on touch —
// most of this app's screens are used on mobile in the field.
//
// Alignment is measured against the viewport on open rather than fixed to
// "centered" — near the page's right edge (e.g. the narrow status/actions
// column on invoice detail) a centered w-56 popover would spill past the
// page margin with no room to render. We flip to left/right-anchored
// whichever side actually has 224px + margin available.
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<Align>('center');
  const buttonRef = useRef<HTMLButtonElement>(null);

  function show() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const center = rect.left + rect.width / 2;
      const halfWidth = TOOLTIP_WIDTH / 2;
      if (center - halfWidth < VIEWPORT_MARGIN) {
        setAlign('left');
      } else if (center + halfWidth > window.innerWidth - VIEWPORT_MARGIN) {
        setAlign('right');
      } else {
        setAlign('center');
      }
    }
    setOpen(true);
  }
  function hide() {
    setOpen(false);
  }

  const positionClass =
    align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          if (open) hide();
          else show();
        }}
        aria-label="Aide"
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <Icon i="info" size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute bottom-full z-20 mb-2 w-56 rounded-md border border-border bg-canvas px-3 py-2 text-left font-body text-xs font-normal text-foreground shadow-xl ${positionClass}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
