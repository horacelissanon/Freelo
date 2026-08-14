import { formatPrice } from '@/lib/utils';
import { EmptyState } from '@/components/ui/PageStates';

export interface RevenueTrendPoint {
  month: string; // "YYYY-MM"
  amount: number;
}

const BAR_AREA_HEIGHT = 120;

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year ?? 2026, (month ?? 1) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short' })
    .replace('.', '');
}

export function RevenueTrendCard({ data }: { data: RevenueTrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  const hasRevenue = data.some((d) => d.amount > 0);

  return (
    <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
      <h2 className="mb-4 font-headings text-base font-semibold text-foreground">
        Revenus (6 derniers mois)
      </h2>
      {!hasRevenue ? (
        <EmptyState
          icon="trending-up"
          title="Pas encore de revenus"
          description="Les factures payées apparaîtront ici, mois par mois."
        />
      ) : (
        <div className="flex items-end justify-between gap-1 sm:gap-2">
          {data.map((d) => (
            <div key={d.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className="hidden font-body text-[10px] whitespace-nowrap text-muted-foreground sm:block">
                {d.amount > 0 ? formatPrice(d.amount) : ''}
              </span>
              <div
                className="flex w-full items-end justify-center"
                style={{ height: BAR_AREA_HEIGHT }}
              >
                <div
                  className="w-full max-w-8 rounded-t-sm bg-primary"
                  style={{ height: Math.max(4, (d.amount / max) * BAR_AREA_HEIGHT) }}
                />
              </div>
              <span className="font-body text-xs text-muted-foreground capitalize">
                {monthLabel(d.month)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
