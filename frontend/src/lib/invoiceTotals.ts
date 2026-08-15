// Shared (client + server) pure math for line-item totals. Deliberately NOT
// under lib/server/ (no `server-only` import): the live form preview and the
// floating total bar need the exact same sum the API persists as
// Invoice.amount, and importing a server-only module from a 'use client'
// component throws at build time.

export interface QuantifiedItem {
  quantity: number;
  unitPrice: number; // integer, smallest currency unit
}

/** Sum of qty × unitPrice across a flat list of items (a facture's lines). */
export function computeItemsTotal(items: QuantifiedItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

/** Sum of every pack's items (a devis' grand total, across all packs). */
export function computeQuoteTotal(packs: { items: QuantifiedItem[] }[]): number {
  return packs.reduce((sum, pack) => sum + computeItemsTotal(pack.items), 0);
}

/**
 * Solde = sous-total − Acompte. Pure subtraction, no clamping — callers
 * (the API route) are responsible for rejecting a depositAmount greater
 * than the total before this ever runs.
 */
export function computeBalance(amount: number, depositAmount: number | null | undefined): number {
  return amount - (depositAmount ?? 0);
}

export type PackDepositType = 'FIXED' | 'PERCENT';

export interface PackDepositSource {
  items: QuantifiedItem[];
  depositType?: PackDepositType | string | null | undefined;
  depositValue?: number | null | undefined;
}

/**
 * A pack's own acompte, in the invoice's smallest currency unit — FIXED
 * returns depositValue as-is, PERCENT applies it to this pack's own total
 * (never a grand total, since offers are independent). Returns null when no
 * deposit is configured for this offer.
 */
export function computePackDeposit(pack: PackDepositSource): number | null {
  if (!pack.depositType || pack.depositValue == null) return null;
  if (pack.depositType === 'PERCENT') {
    return Math.round((computeItemsTotal(pack.items) * pack.depositValue) / 100);
  }
  return pack.depositValue;
}
