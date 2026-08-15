// Small pure color-math helpers shared by the accent/sidebar customization
// contexts and the Affichage settings UI. No dependency pulled in — WCAG
// relative-luminance/contrast is ~15 lines of arithmetic, not worth a package.

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.replace(/(.)/g, '$1$1') : n;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio, from 1 (identical) to 21 (black on white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Whichever of white/near-black reads better on `bg` — always legible. */
export function readableForeground(bg: string): string {
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#0a0a0a') ? '#ffffff' : '#0a0a0a';
}

/** Blends `hex` toward `target` by `amount` (0-1) — used for hover/muted shades. */
export function mixHex(hex: string, target: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(target);
  return rgbToHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
}

export function darkenHex(hex: string, amount = 0.15): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}
