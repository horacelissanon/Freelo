import { formatPrice } from '@/lib/utils';

// Shared between the freelance-side invoice detail page and the public
// /suivi/[token] client view — a devis' packs are grouped offer sections
// that sum into one total (not mutually-exclusive alternatives the client
// picks between), so both renderings just need a clear, well-structured
// breakdown per pack. Deliberately not a flat bordered grid-table: that read
// as a payment receipt rather than a considered proposal — a numbered badge
// + divided rows + a subtotal chip reads as one structured section among
// several, which is what a pack actually is.
export interface PackOfferItem {
  id: string;
  designation: string;
  quantity: number;
  unitPrice: number;
}

export function PackOfferCard({
  index,
  title,
  description,
  items,
  currency,
}: {
  index: number;
  title: string;
  description?: string | null;
  items: PackOfferItem[];
  currency: string;
}) {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-canvas">
      <div className="flex items-start gap-3 border-b border-border bg-secondary/60 px-4 py-3">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary font-body text-[11px] font-bold text-primary-foreground">
          {index}
        </span>
        <div className="min-w-0">
          <p className="font-body text-sm font-semibold text-foreground">{title}</p>
          {description && (
            <p className="mt-0.5 font-body text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0 truncate font-body text-sm text-foreground">
              {item.designation}
              {item.quantity > 1 && (
                <span className="text-muted-foreground"> × {item.quantity}</span>
              )}
            </span>
            <span className="flex-shrink-0 font-body text-sm font-medium text-foreground">
              {formatPrice(item.quantity * item.unitPrice)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 bg-secondary/30 px-4 py-2.5">
        <span className="font-body text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Sous-total
        </span>
        <span className="font-body text-sm font-bold text-foreground">
          {formatPrice(total, currency)}
        </span>
      </div>
    </div>
  );
}
