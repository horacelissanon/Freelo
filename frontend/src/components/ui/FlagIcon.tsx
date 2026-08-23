// Inline SVGs for the 8 UEMOA flags — hand-drawn approximations (simplified
// star/emblem shapes), which is fine at the ~20px picker size these render
// at. Emoji regional-indicator flags (the alternative with zero maintenance)
// don't render as flag glyphs on Windows Chrome — it falls back to plain
// "BJ"/"SN" letter pairs — so for a fixed 8-country list, real SVGs beat
// relying on OS/browser emoji font support.
import type { ReactNode } from 'react';

const FLAGS: Record<string, ReactNode> = {
  BJ: (
    <>
      <rect width="3" height="2" fill="#fcd116" />
      <rect width="3" height="1" y="1" fill="#e8112d" />
      <rect width="1" height="2" fill="#008751" />
    </>
  ),
  BF: (
    <>
      <rect width="3" height="1" fill="#ef2b2d" />
      <rect width="3" height="1" y="1" fill="#009e49" />
      <polygon
        points="1.5,0.65 1.61,0.99 1.97,0.99 1.68,1.2 1.79,1.54 1.5,1.33 1.21,1.54 1.32,1.2 1.03,0.99 1.39,0.99"
        fill="#fcd116"
      />
    </>
  ),
  CI: (
    <>
      <rect width="1" height="2" fill="#f77f00" />
      <rect width="1" height="2" x="1" fill="#ffffff" />
      <rect width="1" height="2" x="2" fill="#009e60" />
    </>
  ),
  GW: (
    <>
      <rect width="3" height="1" fill="#fcd116" />
      <rect width="3" height="1" y="1" fill="#009e49" />
      <rect width="1" height="2" fill="#ce1126" />
      <polygon
        points="0.5,0.55 0.58,0.8 0.85,0.8 0.63,0.95 0.71,1.2 0.5,1.05 0.29,1.2 0.37,0.95 0.15,0.8 0.42,0.8"
        fill="#000000"
      />
    </>
  ),
  ML: (
    <>
      <rect width="1" height="2" fill="#14b53a" />
      <rect width="1" height="2" x="1" fill="#fcd116" />
      <rect width="1" height="2" x="2" fill="#ce1126" />
    </>
  ),
  NE: (
    <>
      <rect width="3" height="0.67" fill="#e05206" />
      <rect width="3" height="0.67" y="0.67" fill="#ffffff" />
      <rect width="3" height="0.66" y="1.34" fill="#0db02b" />
      <circle cx="1.5" cy="1" r="0.32" fill="#e05206" />
    </>
  ),
  SN: (
    <>
      <rect width="1" height="2" fill="#00853f" />
      <rect width="1" height="2" x="1" fill="#fdef42" />
      <rect width="1" height="2" x="2" fill="#e31b23" />
      <polygon
        points="1.5,0.65 1.61,0.99 1.97,0.99 1.68,1.2 1.79,1.54 1.5,1.33 1.21,1.54 1.32,1.2 1.03,0.99 1.39,0.99"
        fill="#00853f"
      />
    </>
  ),
  TG: (
    <>
      <rect width="3" height="2" fill="#006a4e" />
      <rect width="3" height="0.4" y="0.4" fill="#fcd116" />
      <rect width="3" height="0.4" y="1.2" fill="#fcd116" />
      <rect width="1.2" height="1.2" fill="#d21034" />
      <polygon
        points="0.6,0.3 0.7,0.6 1,0.6 0.76,0.78 0.85,1.08 0.6,0.9 0.35,1.08 0.44,0.78 0.2,0.6 0.5,0.6"
        fill="#ffffff"
      />
    </>
  ),
};

export function FlagIcon({ iso2, className = '' }: { iso2: string; className?: string }) {
  const flag = FLAGS[iso2];
  if (!flag) return null;
  return (
    <svg
      viewBox="0 0 3 2"
      width="18"
      height="12"
      className={`flex-shrink-0 rounded-[2px] ${className}`}
      aria-hidden="true"
    >
      {flag}
    </svg>
  );
}
