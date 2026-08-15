import { Icon } from '@/components/ui/Icon';

export interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  icon: string;
  trend?: { text: string; up: boolean } | undefined;
  /** When set, an eye/eye-off button replaces the category icon and masks
   *  value/unit/trend behind stars until clicked — used for the revenue
   *  card (Paramètres has no server-side setting for this, it's a per-device
   *  localStorage preference, same as sidebar-collapsed/bottom-nav-glass). */
  masked?: boolean;
  onToggleMasked?: () => void;
}

export function StatCard({
  label,
  value,
  unit,
  icon,
  trend,
  masked,
  onToggleMasked,
}: StatCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-canvas shadow-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-body text-xs text-muted-foreground sm:text-sm">{label}</span>
        {onToggleMasked ? (
          <button
            type="button"
            onClick={onToggleMasked}
            aria-label={masked ? 'Afficher le montant' : 'Masquer le montant'}
            title={masked ? 'Afficher le montant' : 'Masquer le montant'}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Icon i={masked ? 'eye-off' : 'eye'} size={14} />
          </button>
        ) : (
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-secondary">
            <Icon i={icon} size={14} />
          </div>
        )}
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
