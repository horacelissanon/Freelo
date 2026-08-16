import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils';
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  DOC_TYPE_LABELS,
  type InvoiceStatus,
  type InvoiceDocType,
} from '@/lib/constants';

// Card variant of InvoiceRow, used only in the /invoices grid view (view-mode
// toggle). InvoiceRow stays the compact row for list mode.
export interface InvoiceCardData {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
  clientName: string;
  amount: number;
  currency: string;
  dueDateLabel: string | null;
  /** Facture: stored acompte. Devis: estimated from the selected/only pack — null when not resolvable. */
  depositAmount?: number | null;
  /** Facture only — devis never show a "solde" pre-acceptance. */
  balanceAmount?: number | null;
}

export function InvoiceCard({ invoice }: { invoice: InvoiceCardData }) {
  const colors = INVOICE_STATUS_COLORS[invoice.status];
  const docType = DOC_TYPE_LABELS[invoice.docType];
  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-canvas shadow-card p-4 font-body transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary">
          <Icon i={colors.icon} size={18} />
        </div>
        <span
          className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.fg}`}
        >
          {INVOICE_STATUS_LABELS[invoice.status]}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {docType.long} {invoice.number}
        </p>
        <p className="truncate text-xs text-muted-foreground">{invoice.clientName}</p>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {formatPrice(invoice.amount)}{' '}
            <span className="text-xs font-normal text-muted-foreground">{invoice.currency}</span>
          </p>
          {invoice.dueDateLabel && (
            <p className="text-xs text-muted-foreground">Échéance {invoice.dueDateLabel}</p>
          )}
          {invoice.docType === 'INVOICE' &&
            invoice.depositAmount != null &&
            invoice.balanceAmount != null && (
              <p className="text-xs text-muted-foreground">
                Ac. {formatPrice(invoice.depositAmount)} · Sd. {formatPrice(invoice.balanceAmount)}
              </p>
            )}
          {invoice.docType === 'QUOTE' && invoice.depositAmount != null && (
            <p className="text-xs text-muted-foreground">
              Acompte prévu {formatPrice(invoice.depositAmount)}
            </p>
          )}
        </div>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
          <Icon i="chevron-right" size={14} />
        </div>
      </div>
    </Link>
  );
}
