'use client';

import { Icon } from '@/components/ui/Icon';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

// Generic {primaryText, secondaryText} draft — mirrors QuoteContentBlock's
// and DefaultPaymentMethod's shape, reused across the devis builder's 4
// additional sections (PROCESS/CONDITIONS/PAYMENT_METHOD/FAQ) and the
// freelancer's default payment methods (Paramètres → Facturation).
export interface ContentBlockDraft {
  primaryText: string;
  secondaryText: string;
}

// Shared editor for any repeatable {primaryText, secondaryText} list — same
// add/remove/update pattern as pack items, just without the numeric
// qty/price columns. Kept always-expanded (no "Auto" badge/chevron) to match
// the rest of these builders' visual language.
export function ContentBlockList({
  title,
  icon,
  primaryPlaceholder,
  secondaryPlaceholder,
  addLabel,
  blocks,
  onChange,
}: {
  title: string;
  icon: string;
  primaryPlaceholder: string;
  secondaryPlaceholder: string;
  addLabel: string;
  blocks: ContentBlockDraft[];
  onChange: (blocks: ContentBlockDraft[]) => void;
}) {
  function update(index: number, field: keyof ContentBlockDraft, value: string) {
    onChange(blocks.map((b, i) => (i === index ? { ...b, [field]: value } : b)));
  }
  function add() {
    onChange([...blocks, { primaryText: '', secondaryText: '' }]);
  }
  function remove(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Icon i={icon} size={16} className="text-muted-foreground" />
        <p className="font-body text-sm font-semibold text-foreground">{title}</p>
      </div>
      {blocks.length > 0 && (
        <div className="flex flex-col gap-2">
          {blocks.map((block, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  type="text"
                  placeholder={primaryPlaceholder}
                  value={block.primaryText}
                  onChange={(e) => update(index, 'primaryText', e.target.value)}
                  maxLength={500}
                  className={inputClass}
                />
                <textarea
                  placeholder={secondaryPlaceholder}
                  value={block.secondaryText}
                  onChange={(e) => update(index, 'secondaryText', e.target.value)}
                  maxLength={2000}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="Retirer"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
              >
                <Icon i="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
      >
        <Icon i="plus" size={13} />
        {addLabel}
      </button>
    </div>
  );
}
