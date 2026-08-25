// Static (no client JS needed) comparison table — original categories and
// wording, extending the "5 outils remplacés" framing already used in
// page.tsx's problème/solution section into a fuller table. Every row
// states a real ZeFacto capability, nothing fabricated.
import { Icon } from '@/components/ui/Icon';

export interface ComparisonRow {
  category: string;
  headline: string;
  zefacto: string;
  patchwork: string;
}

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-canvas shadow-card">
      <div className="grid grid-cols-1 divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.category}
            className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[180px_1fr] sm:gap-6 sm:p-5"
          >
            <div>
              <p className="font-body text-xs font-semibold tracking-wide text-primary uppercase">
                {row.category}
              </p>
              <p className="mt-1 font-headings text-sm font-semibold text-foreground">
                {row.headline}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="flex items-start gap-1.5 rounded-md bg-tag-green/60 p-2.5 sm:gap-2 sm:p-3">
                <Icon
                  i="check-circle"
                  size={14}
                  className="mt-0.5 flex-shrink-0 text-tag-green-fg sm:h-4 sm:w-4"
                />
                <div className="min-w-0">
                  <p className="font-body text-[11px] font-semibold text-tag-green-fg sm:text-xs">
                    ZeFacto
                  </p>
                  <p className="mt-0.5 font-body text-xs text-foreground sm:text-sm">
                    {row.zefacto}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-1.5 rounded-md bg-secondary/70 p-2.5 sm:gap-2 sm:p-3">
                <Icon
                  i="x"
                  size={14}
                  className="mt-0.5 flex-shrink-0 text-muted-foreground sm:h-4 sm:w-4"
                />
                <div className="min-w-0">
                  <p className="font-body text-[11px] font-semibold text-muted-foreground sm:text-xs">
                    Sans ZeFacto
                  </p>
                  <p className="mt-0.5 font-body text-xs text-muted-foreground sm:text-sm">
                    {row.patchwork}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
