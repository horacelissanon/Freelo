import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils';

export interface UnpaidInvoiceItem {
  id: string;
  number: string;
  amount: number;
  client: { id: string; name: string };
}

export function UnpaidInvoicesPanel({
  invoices,
  total,
}: {
  invoices: UnpaidInvoiceItem[];
  total: number;
}) {
  if (invoices.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="mb-3 font-body text-xs tracking-wider text-muted-foreground uppercase">
        À encaisser
      </p>
      <div className="flex flex-col gap-2.5">
        {invoices.map((inv) => (
          <Link
            key={inv.id}
            href={`/clients/${inv.client.id}`}
            className="flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <p className="truncate font-body text-sm font-medium text-foreground">
                {inv.client.name}
              </p>
              <p className="font-body text-xs text-muted-foreground">Facture #{inv.number}</p>
            </div>
            <p className="flex-shrink-0 font-body text-sm font-bold text-primary">
              {formatPrice(inv.amount)}
            </p>
          </Link>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <p className="font-body text-xs font-semibold text-foreground">Total</p>
          <p className="font-body text-sm font-bold text-foreground">
            {formatPrice(total)} <span className="font-normal text-muted-foreground">FCFA</span>
          </p>
        </div>
      </div>
      <Link
        href="/invoices"
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-secondary py-2.5 font-body text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
      >
        Voir toutes les factures
        <Icon i="chevron-right" size={14} />
      </Link>
    </div>
  );
}
