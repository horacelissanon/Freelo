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

export interface InvoiceRowData {
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

export function InvoiceRow({ invoice, index }: { invoice: InvoiceRowData; index?: number }) {
  const colors = INVOICE_STATUS_COLORS[invoice.status];
  const docType = DOC_TYPE_LABELS[invoice.docType];
  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="flex items-center gap-4 border-b border-border py-3.5 font-body last:border-b-0"
    >
      {index !== undefined && (
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-body text-xs font-bold text-foreground">
          {index + 1}
        </span>
      )}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-secondary">
        <Icon i={colors.icon} size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {docType.long} {invoice.number}
        </p>
        <p className="truncate text-xs text-muted-foreground">{invoice.clientName}</p>
      </div>
      <div
        className={`hidden flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:block ${colors.bg} ${colors.fg}`}
      >
        {INVOICE_STATUS_LABELS[invoice.status]}
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-sm font-medium text-foreground">
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
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-secondary">
        <Icon i="chevron-right" size={14} />
      </div>
    </Link>
  );
}
