// Static (no client JS needed) comparison table — original categories and
// wording, extending the "5 outils remplacés" framing already used in
// page.tsx's problème/solution section into a fuller table. Every row
// states a real Freelo capability, nothing fabricated.
import { Icon } from '@/components/ui/Icon';

export interface ComparisonRow {
  category: string;
  headline: string;
  freelo: string;
  patchwork: string;
}

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-canvas shadow-card">
      <div className="grid grid-cols-1 divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.category}
            className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[180px_1fr] sm:gap-6"
          >
            <div>
              <p className="font-body text-xs font-semibold tracking-wide text-primary uppercase">
                {row.category}
              </p>
              <p className="mt-1 font-headings text-sm font-semibold text-foreground">
                {row.headline}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-2 rounded-md bg-tag-green/60 p-3">
                <Icon
                  i="check-circle"
                  size={16}
                  className="mt-0.5 flex-shrink-0 text-tag-green-fg"
                />
                <div>
                  <p className="font-body text-xs font-semibold text-tag-green-fg">Freelo</p>
                  <p className="mt-0.5 font-body text-sm text-foreground">{row.freelo}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md bg-secondary/70 p-3">
                <Icon i="x" size={16} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-body text-xs font-semibold text-muted-foreground">
                    Sans Freelo
                  </p>
                  <p className="mt-0.5 font-body text-sm text-muted-foreground">{row.patchwork}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
