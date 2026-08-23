import { Icon } from '@/components/ui/Icon';

export interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  icon: string;
  trend?: { text: string; up: boolean } | undefined;
  /** Masks value/unit/trend behind stars — driven by the global
   *  MoneyMaskContext toggle (Sidebar/mobile top bar), not a per-card
   *  control. */
  masked?: boolean;
}

export function StatCard({ label, value, unit, icon, trend, masked }: StatCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-canvas shadow-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 font-body text-xs text-muted-foreground sm:text-sm">
          {label}
        </span>
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon i={icon} size={14} className="text-primary" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-1.5">
        <span className="font-headings text-xl leading-none font-bold text-foreground sm:text-2xl">
          {masked ? '••••••' : value}
        </span>
        {unit && !masked && (
          <span className="font-body text-xs text-muted-foreground sm:text-sm">{unit}</span>
        )}
      </div>
      {trend && !masked && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Icon
            i={trend.up ? 'trending-up' : 'trending-down'}
            size={13}
            className="flex-shrink-0"
          />
          <span
            className={`font-body text-xs font-medium ${trend.up ? 'text-accent' : 'text-primary'}`}
          >
            {trend.text}
          </span>
          <span className="font-body text-xs text-muted-foreground">vs mois dernier</span>
        </div>
      )}
    </div>
  );
}
