import { formatPrice } from '@/lib/utils';

// Shared between the freelance-side invoice detail page and the public
// /suivi/[token] client view. Each pack gets its own rotating accent color
// (top bar + numbered badge + subtotal chip) so two offers read as visually
// distinct proposals at a glance, not as two sections of the same bill —
// the flat single-primary-color version this replaced was the exact
// complaint: "les deux offres semblent être pour la même facture."
const PACK_ACCENTS = [
  {
    bar: 'bg-primary',
    badge: 'bg-primary text-primary-foreground',
    chip: 'bg-tag-green text-tag-green-fg',
  },
  {
    bar: 'bg-violet-500',
    badge: 'bg-violet-500 text-white',
    chip: 'bg-tag-purple text-tag-purple-fg',
  },
  {
    bar: 'bg-blue-500',
    badge: 'bg-blue-500 text-white',
    chip: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  {
    bar: 'bg-orange-500',
    badge: 'bg-orange-500 text-white',
    chip: 'bg-tag-orange text-tag-orange-fg',
  },
] as const;

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
  selected,
}: {
  index: number;
  title: string;
  description?: string | null;
  items: PackOfferItem[];
  currency: string;
  /** True once the client has accepted this specific offer (Invoice.selectedPackId). */
  selected?: boolean;
}) {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const accent = PACK_ACCENTS[(index - 1) % PACK_ACCENTS.length]!;

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-canvas shadow-card ${selected ? 'border-2 border-tag-green-fg' : 'border-border'}`}
    >
      <div className={`h-1.5 ${accent.bar}`} />
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full font-body text-xs font-bold ${accent.badge}`}
          >
            {index}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-body text-sm font-semibold text-foreground">{title}</p>
              {selected && (
                <span className="flex-shrink-0 rounded-full bg-tag-green px-2 py-0.5 font-body text-[10px] font-bold text-tag-green-fg uppercase">
                  Offre retenue
                </span>
              )}
            </div>
            {description && (
              <p className="mt-0.5 font-body text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <span
          className={`flex-shrink-0 rounded-full px-2.5 py-1 font-body text-xs font-bold ${accent.chip}`}
        >
          {formatPrice(total, currency)}
        </span>
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
