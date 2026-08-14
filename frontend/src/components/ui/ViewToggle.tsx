import { Icon } from '@/components/ui/Icon';

export type ListViewMode = 'list' | 'grid';

export function ViewToggle({
  value,
  onChange,
}: {
  value: ListViewMode;
  onChange: (mode: ListViewMode) => void;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-0.5 rounded-md border border-border bg-input p-1">
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-label="Afficher en liste"
        aria-pressed={value === 'list'}
        className={`flex h-8 w-8 items-center justify-center rounded ${
          value === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        <Icon i="list" size={16} />
      </button>
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-label="Afficher en cadran"
        aria-pressed={value === 'grid'}
        className={`flex h-8 w-8 items-center justify-center rounded ${
          value === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        <Icon i="layout-grid" size={16} />
      </button>
    </div>
  );
}
