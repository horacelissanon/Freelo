export interface FilterTab {
  key: string;
  label: string;
  count: number;
}

export function FilterTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: FilterTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border font-body">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex-shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            active === tab.key
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          {tab.label} <span className="text-xs text-muted-foreground">({tab.count})</span>
        </button>
      ))}
    </div>
  );
}
